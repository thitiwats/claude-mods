// Runs the mod's real prompts against a real model and grades the rewrites with a judge model.
// Usage: bun plugins/prompt-upgrade/eval/run.ts [--model <m>] [--judge <m>] [--case <name>]
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CASES } from './cases'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const MODEL = arg('model', 'opus')
const JUDGE = arg('judge', 'opus')
const ONLY = arg('case', '')
const CONCURRENCY = 4

type Question = { text: string; options: string[] }
type Rewrite = { text: string; added: string[] }

// The builders and parsers sit in register.tsx beside engine imports; lift that stretch out so the eval runs the shipped text.
const loadMod = () => {
  const source = readFileSync(join(import.meta.dir, '../hooks/register.tsx'), 'utf8')
  const consts = source.slice(source.indexOf('const MAX_QUESTIONS'), source.indexOf('const upgrade = atom'))
  const body = source.slice(source.indexOf('const LANGUAGE'), source.indexOf('const words'))
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(consts + body)
  return new Function(`${js}\nreturn { questionsPrompt, rewritePrompt, asQuestions, asRewrite, formatAnswers }`)() as {
    questionsPrompt: (original: string) => string
    rewritePrompt: (original: string, answered: string) => string
    asQuestions: (text: string) => Question[] | undefined
    asRewrite: (text: string) => Rewrite | undefined
    formatAnswers: (questions: Question[], answers: unknown[]) => string
  }
}
const mod = loadMod()

// A bare call with no tools or project context, like the mod's fallback when there is no conversation to fork.
// It runs from a temp dir so this repo's CLAUDE.md and memory stay out of the reply.
const complete = async (model: string, prompt: string) => {
  const proc = Bun.spawn(
    ['claude', '-p', '--model', model, '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'],
    { cwd: tmpdir(), stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe' },
  )
  const out = await new Response(proc.stdout).text()
  await proc.exited
  const json = JSON.parse(out) as { result: string; total_cost_usd?: number }
  return { text: json.result, cost: json.total_cost_usd ?? 0 }
}

const CRITERIA = ['keeps_original', 'no_invention', 'added_accurate', 'guesses_as_assumptions', 'language', 'better'] as const

const judgePrompt = (original: string, answered: string, rewrite: Rewrite) =>
  [
    'You grade a prompt rewriter. It turned the ORIGINAL prompt into the REWRITE, using the ANSWERS (answers marked "unconfirmed" were the rewriter\'s own guesses, which the user never confirmed).',
    'ADDED is the rewriter\'s own list of details the rewrite states that the original did not.',
    'Its rules: keep every detail, constraint, name, path, quote, number and code snippet of the original, never weakened;',
    'add only what comes from the answers, or structure and output format; never invent facts, write unknowns as [placeholder];',
    'write unconfirmed answers as assumptions the user can change, not requirements; write in the original\'s language with technical terms in English.',
    '',
    'Be strict. Score each criterion pass or fail, with a short note quoting the evidence for any fail:',
    '- keeps_original: nothing from the original dropped or weakened',
    '- no_invention: no concrete new requirement or fact (file, library, number, behaviour, extra work) that comes from neither the original nor the answers; structure, output format and [placeholder] are allowed',
    '- added_accurate: ADDED covers every real addition and lists nothing false',
    '- guesses_as_assumptions: every unconfirmed answer reads as a changeable assumption (pass when there are none)',
    '- language: same language as the original, technical terms in English',
    '- better: a developer would get a better result sending the rewrite than the original',
    `Reply with JSON only: {${CRITERIA.map(k => `"${k}":{"pass":true,"note":""}`).join(',')}}`,
    '',
    `<original>\n${original}\n</original>`,
    `<answers>\n${answered || '(none)'}\n</answers>`,
    `<rewrite>\n${rewrite.text}\n</rewrite>`,
    `<added>\n${JSON.stringify(rewrite.added)}\n</added>`,
  ].join('\n')

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

// The path most users take: accept every recommended option with "Upgrade now".
const runCase = async (c: (typeof CASES)[number]) => {
  let cost = 0
  const q = await complete(MODEL, mod.questionsPrompt(c.prompt))
  cost += q.cost
  const questions = mod.asQuestions(q.text)
  if (!questions) return { name: c.name, error: `unreadable questions: ${q.text.slice(0, 200)}`, cost }
  const answered = mod.formatAnswers(questions, questions.map(() => ({ kind: 'option', index: 0, isGuess: true })))
  const r = await complete(MODEL, mod.rewritePrompt(c.prompt, answered))
  cost += r.cost
  const rewrite = mod.asRewrite(r.text)
  if (!rewrite) return { name: c.name, error: `unreadable rewrite: ${r.text.slice(0, 200)}`, cost }
  const j = await complete(JUDGE, judgePrompt(c.prompt, answered, rewrite))
  cost += j.cost
  const verdict = JSON.parse(j.text.slice(j.text.indexOf('{'), j.text.lastIndexOf('}') + 1)) as Record<string, { pass: boolean; note: string }>
  const limit = Math.max(300, Math.round(words(c.prompt) * 1.5))
  const checks = {
    questions_shape: questions.length <= 3 && questions.every(x => x.options.length >= 2 && x.options.length <= 4),
    within_length: words(rewrite.text) <= limit,
  }
  return { name: c.name, original: c.prompt, questions, answered, rewrite, verdict, checks, cost }
}

type Result = Awaited<ReturnType<typeof runCase>>
type Graded = Extract<Result, { verdict: unknown }>

const cases = CASES.filter(c => !ONLY || c.name === ONLY)
const results: Result[] = new Array(cases.length)
let next = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < cases.length) {
      const i = next++
      results[i] = await runCase(cases[i]).catch(e => ({ name: cases[i].name, error: String(e), cost: 0 }))
      console.error(`done ${cases[i].name}`)
    }
  }),
)

const out = join(import.meta.dir, `results-${MODEL}.json`)
writeFileSync(out, JSON.stringify(results, null, 2))

const mark = (isPass: boolean | undefined) => (isPass ? '✓' : '✗')
console.log(['case', 'Qs', ...CRITERIA, 'questions_shape', 'within_length'].join('\t'))
for (const r of results) {
  if (!('verdict' in r)) {
    console.log(`${r.name}\tERROR ${r.error}`)
    continue
  }
  console.log([r.name, r.questions.length, ...CRITERIA.map(k => mark(r.verdict[k]?.pass)), mark(r.checks.questions_shape), mark(r.checks.within_length)].join('\t'))
}
const graded = results.filter((r): r is Graded => 'verdict' in r)
for (const k of CRITERIA) console.log(`${k}: ${graded.filter(r => r.verdict[k]?.pass).length}/${graded.length}`)
console.log(`cost: $${results.reduce((sum, r) => sum + r.cost, 0).toFixed(2)} · details: ${out}`)
