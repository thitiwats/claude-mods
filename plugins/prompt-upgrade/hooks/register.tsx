import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Answer, Ask, Question, Rewrite, Upgrade } from '../types'

const PANE = 'prompt-upgrade'
const USAGE = 'Usage: /prompt-upgrade <prompt>'

const MAX_QUESTIONS = 3
const MAX_OPTIONS = 4

const upgrade = atom({ plugin: 'prompt-upgrade', key: 'upgrade' } as const, null as Upgrade | null)

const IDLE = { status: 'idle' } as const
const LOADING = { status: 'loading' } as const

const questionsPrompt = (original: string) =>
  [
    'The user wants to send the prompt below to you, and asked to improve it first.',
    'Ask at most 3 multiple-choice clarifying questions about what the prompt leaves open that would most change the result;',
    'ask none when the prompt is already clear or this conversation already answers it.',
    'Give each question 2 to 4 short options. Put first the option you judge most likely matches what the user means,',
    'given this conversation: it is shown to them as the recommended one.',
    'Write questions and options in the language the prompt is written in.',
    'Reply with JSON only, no markdown: {"questions":[{"question":"...","options":["...","..."]}]}',
    '',
    '<prompt>',
    original,
    '</prompt>',
  ].join('\n')

const rewritePrompt = (original: string, answered: string) =>
  [
    'Rewrite the user\'s prompt below into a clearer, more complete prompt for you, with the same intent.',
    'Add only what comes from the user\'s answers, from this conversation, or structure and output format.',
    'Never invent facts: write anything still unknown as a [placeholder].',
    'Keep the language the prompt is written in. Keep it under 300 words; shorter is fine when the task is simple.',
    'Also list each detail the rewrite states that the original did not, a few words each, in the same language.',
    'Reply with JSON only, no markdown: {"prompt":"...","added":["..."]}',
    '',
    '<prompt>',
    original,
    '</prompt>',
    ...(answered ? ['', '<answers>', answered, '</answers>'] : []),
  ].join('\n')

// Models wrap JSON in a fence or a sentence now and then; read the outermost object.
const parseJson = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

const asQuestions = (text: string): Question[] | undefined => {
  const list = (parseJson(text) as { questions?: unknown } | undefined)?.questions
  if (!Array.isArray(list)) return undefined
  return list
    .map(q => ({ text: (q as { question?: unknown }).question, options: (q as { options?: unknown }).options }))
    .filter((q): q is { text: string; options: unknown[] } => isText(q.text) && Array.isArray(q.options))
    .map(q => ({ text: q.text.trim(), options: q.options.filter(isText).map(o => o.trim()).slice(0, MAX_OPTIONS) }))
    .filter(q => q.options.length > 0)
    .slice(0, MAX_QUESTIONS)
}

const asRewrite = (text: string): Rewrite | undefined => {
  const reply = parseJson(text) as { prompt?: unknown; added?: unknown } | undefined
  if (!isText(reply?.prompt)) return undefined
  return { text: reply.prompt.trim(), added: Array.isArray(reply.added) ? reply.added.filter(isText) : [] }
}

const answerText = (q: Question, a: Answer | undefined) =>
  a?.kind === 'option' ? q.options[a.index] : a?.kind === 'other' && a.text.trim() ? a.text.trim() : undefined

const formatAnswers = (questions: Question[], answers: Answer[]) =>
  questions
    .map((q, i) => ({ q, a: answerText(q, answers[i]) }))
    .filter(({ a }) => a !== undefined)
    .map(({ q, a }) => `Q: ${q.text}\nA: ${a}`)
    .join('\n')

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

// The fork sees this conversation; a new or cleared one has nothing to fork, so ask the same model without it.
const ask = async ($: EngineInterface, prompt: string) => {
  const forked = await $.model.fork({ prompt })
  if (forked.isAnswered || forked.reason !== 'nothing-to-fork') return forked
  return $.model.complete({ model: await $.session.model(), prompt })
}

// Writes a step's result only while its run is still the one in the pane.
const settle = ($: EngineInterface, id: number, change: (u: Upgrade) => Upgrade) =>
  update($, upgrade, u => (u?.id === id ? change(u) : u))

// Reads the answers as they stand now, not as a drawing captured them.
const rewrite = async ($: EngineInterface, id: number) => {
  let u: Upgrade | undefined
  await settle($, id, x => ((u = x), { ...x, rewrite: LOADING }))
  if (!u) return
  const questions = u.questions.status === 'ready' ? u.questions.value : []
  const reply = await ask($, rewritePrompt(u.original, formatAnswers(questions, u.answers)))
  const value = reply.isAnswered ? asRewrite(reply.text) : undefined
  const result: Ask<Rewrite> = value
    ? { status: 'ready', value }
    : { status: 'failed', reason: reply.isAnswered ? 'unreadable reply' : reply.reason }
  await settle($, u.id, x => ({ ...x, rewrite: result }))
}

const askQuestions = async ($: EngineInterface, u: Upgrade) => {
  await settle($, u.id, x => ({ ...x, questions: LOADING }))
  const reply = await ask($, questionsPrompt(u.original))
  const value = reply.isAnswered ? asQuestions(reply.text) : undefined
  if (!value) {
    const reason = reply.isAnswered ? 'unreadable reply' : reply.reason
    await settle($, u.id, x => ({ ...x, questions: { status: 'failed', reason } }))
    return
  }
  // Each question starts on its recommended option, so accepting them all is one press.
  const ready: Upgrade = { ...u, questions: { status: 'ready', value }, answers: value.map(() => ({ kind: 'option', index: 0 })) }
  await settle($, u.id, () => ready)
  if (value.length === 0) await rewrite($, u.id)
}

// Clears the run before closing, so the close hook knows the pane was not dismissed.
const finish = async ($: EngineInterface) => {
  await update($, upgrade, () => null)
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-upgrade',
      description: 'Ask a few questions, then rewrite a prompt clearer and more complete with the same intent',
      argumentHint: '<prompt>',
    })
    return next(e)
  })

  on('command.run', { command: 'prompt-upgrade' }, async ($, e) => {
    const original = e.args.trim()
    if (!original) return { text: USAGE }

    const previous = await read($, upgrade)
    const u: Upgrade = { id: (previous?.id ?? 0) + 1, original, questions: IDLE, answers: [], rewrite: IDLE }
    await update($, upgrade, () => u)
    const opened = await $.ui.open({ id: PANE, title: 'Prompt upgrade', focus: true, closeOnEscape: true })
    if (!opened.isPlaced) {
      await finish($)
      await $.prompt.fill({ text: original })
      $.ui.toast(`Prompt upgrade skipped: ${opened.reason}`)
      return {}
    }
    await askQuestions($, u)
    return {}
  })

  // Esc or the close mark leaves the original prompt where the user can still send it.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const u = await read($, upgrade)
    if (u) {
      await update($, upgrade, () => null)
      await $.prompt.fill({ text: u.original })
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const rest = await next(e)
    const u = await read($, upgrade)
    if (!u) return rest

    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // Mobile draws no text field, so it offers no typed answer.
    const Input = 'Input' in elements ? elements.Input : undefined
    const step =
      u.rewrite.status === 'ready' ? 3 : u.rewrite.status !== 'idle' ? 2 : u.questions.status === 'ready' ? 1 : 0
    const STEPS = ['Your prompt', 'Questions', 'Rewrite', 'Review']

    const steps = (
      <Box columnGap={1} flexWrap="wrap">
        {STEPS.map((name, i) => (
          <Text key={name} color={i < step ? 'success' : i === step ? 'warning' : undefined} dimColor={i > step} bold={i === step}>
            {i < step ? '✓' : i === step ? '●' : '○'} {name}
            {i < STEPS.length - 1 ? ' ──' : ''}
          </Text>
        ))}
      </Box>
    )

    const box = (title: string, text: string, color?: 'warning') => (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} flexGrow={1} flexShrink={1}>
        <Text bold color={color}>
          {title}
        </Text>
        <Text>{text}</Text>
      </Box>
    )

    const cancel = (
      <Button
        key="cancel"
        label="Cancel"
        onPress={async () => {
          await finish($)
          await $.prompt.fill({ text: u.original })
        }}
      />
    )
    const sendOriginal = (
      <Button
        key="original"
        label="Send original"
        onPress={async () => {
          await finish($)
          await $.prompt.submit({ text: u.original, asUser: true })
        }}
      />
    )

    const failure = (reason: string, retry: () => Promise<void>) => (
      <Box flexDirection="column" rowGap={1}>
        <Text color="error">Could not upgrade the prompt: {reason}</Text>
        <Box columnGap={1}>
          <Button key="retry" variant="primary" label="Retry" onPress={retry} />
          {sendOriginal}
          {cancel}
        </Box>
      </Box>
    )

    let body: RenderChildren
    if (u.questions.status === 'failed') {
      body = failure(u.questions.reason, () => askQuestions($, u))
    } else if (u.rewrite.status === 'failed') {
      body = failure(u.rewrite.reason, () => rewrite($, u.id))
    } else if (u.rewrite.status === 'ready') {
      const { text, added } = u.rewrite.value
      const isWide = e.props.bodyColumns >= 80
      body = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            <Text dimColor>{words(u.original)} words → </Text>
            <Text bold>{words(text)} words</Text>
            <Text color="success">
              {'   '}
              {added.length} {added.length === 1 ? 'detail' : 'details'} added
            </Text>
          </Text>
          <Box columnGap={1} flexWrap="wrap">
            <Button
              key="run"
              variant="primary"
              label="▶ Run it"
              onPress={async () => {
                await finish($)
                await $.prompt.submit({ text, asUser: true })
              }}
            />
            <Button
              key="edit"
              label="Edit"
              onPress={async () => {
                await finish($)
                await $.prompt.fill({ text })
              }}
            />
            <Button
              key="copy"
              label="Copy"
              onPress={async press => {
                const copied = await $.ui.copy({ text, surface: press.surface })
                $.ui.toast(copied.isCopied ? 'Copied' : `Could not copy: ${copied.reason}`)
              }}
            />
            {sendOriginal}
            {cancel}
          </Box>
          {added.length > 0 && (
            <Box flexDirection="column">
              <Text dimColor bold>
                WHAT I ADDED
              </Text>
              {added.map((detail, i) => (
                <Text key={`added-${i}`}>
                  <Text color="success">+ </Text>
                  {detail}
                </Text>
              ))}
            </Box>
          )}
          <Box flexDirection={isWide ? 'row' : 'column'} columnGap={1}>
            {box('YOUR PROMPT', u.original)}
            {box('+ UPGRADED', text, 'warning')}
          </Box>
        </Box>
      )
    } else if (u.rewrite.status === 'loading') {
      body = (
        <Box flexDirection="column" rowGap={1}>
          {box('YOUR PROMPT', u.original)}
          <Text bold>
            <Text color="warning">◆</Text> Writing your upgraded prompt
          </Text>
          <Text dimColor>This usually takes a few seconds.</Text>
          <Box>{cancel}</Box>
        </Box>
      )
    } else if (u.questions.status === 'ready') {
      const questions = u.questions.value
      const pick = (i: number, answer: Answer) =>
        update($, upgrade, x => (x?.id === u.id ? { ...x, answers: x.answers.map((a, j) => (j === i ? answer : a)) } : x))
      body = (
        <Box flexDirection="column" rowGap={1}>
          {box('YOUR PROMPT', u.original)}
          <Text dimColor bold>
            A FEW QUICK QUESTIONS <Text dimColor>· the recommended answer is picked; change any, or skip</Text>
          </Text>
          {questions.map((q, i) => {
            const a = u.answers[i]
            return (
              <Box key={`q${i}`} flexDirection="column">
                <Text bold>
                  <Text color="warning">{i + 1}</Text> {q.text}
                </Text>
                <Box columnGap={1} flexWrap="wrap" paddingLeft={2}>
                  {q.options.map((option, j) => (
                    <Button
                      key={`q${i}-${j}`}
                      variant={a?.kind === 'option' && a.index === j ? 'primary' : undefined}
                      label={j === 0 ? `${option} (Recommended)` : option}
                      onPress={() => pick(i, { kind: 'option', index: j })}
                    />
                  ))}
                  {Input && (
                    <Button
                      key={`q${i}-other`}
                      variant={a?.kind === 'other' ? 'primary' : undefined}
                      label="Other (type it)"
                      onPress={() => pick(i, { kind: 'other', text: a?.kind === 'other' ? a.text : '' })}
                    />
                  )}
                  <Button key={`q${i}-skip`} variant={a?.kind === 'skip' ? 'primary' : undefined} label="Skip" onPress={() => pick(i, { kind: 'skip' })} />
                </Box>
                {Input && a?.kind === 'other' && (
                  <Box paddingLeft={2}>
                    <Input
                      key={`q${i}-text`}
                      placeholder="Type your answer"
                      value={a.text}
                      submitLabel="keep"
                      onInput={text => pick(i, { kind: 'other', text })}
                      onSubmit={text => pick(i, { kind: 'other', text })}
                    />
                  </Box>
                )}
              </Box>
            )
          })}
          <Box columnGap={1}>
            <Button key="upgrade" variant="primary" label="Upgrade now" onPress={() => rewrite($, u.id)} />
            {cancel}
          </Box>
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column" rowGap={1}>
          {box('YOUR PROMPT', u.original)}
          <Text dimColor>Reading your prompt…</Text>
          <Box>{cancel}</Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {rest}
        <Box flexDirection="column" rowGap={1}>
          {steps}
          {body}
        </Box>
      </Box>
    )
  })
}
