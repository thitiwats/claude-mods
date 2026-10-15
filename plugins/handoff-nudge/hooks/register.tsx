import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren } from 'claude-code'

import type { Handoff, Suggestion } from '../types'

// Room left below auto-compaction or a full window, so the band shows while there is still time to hand off.
const HEADROOM = 0.9

// What the band compares the context to: the chosen threshold, pulled below where compaction runs or the window ends.
const effectiveThreshold = (chosen: number, window: number, autoCompactAt: number | undefined) =>
  Math.floor(Math.min(chosen, ...[window, autoCompactAt ?? 0].filter(n => n > 0).map(n => n * HEADROOM)))

const HANDOFFS_KEY = 'handoffs'
const MAX_KEPT = 20
const MAX_SHOWN = 3
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// /handoff saves to $TMPDIR (else /tmp); macOS resolves /tmp through /private/tmp.
const TMP_ROOTS = ['/tmp/', '/private/tmp/']

const isHandoffDoc = (path: string, tmpdir: string | undefined) =>
  /handoff/i.test(path) &&
  path.endsWith('.md') &&
  [...TMP_ROOTS, ...(tmpdir ? [tmpdir.endsWith('/') ? tmpdir : `${tmpdir}/`] : [])].some(root => path.startsWith(root))

const isUnder = (path: string, folder: string) => path.startsWith(folder.endsWith('/') ? folder : `${folder}/`)

// A doc written in a subfolder of this project, or above it, still belongs here; home and / hold every project, so they never count.
const isNearby = (docCwd: string, cwd: string, home: string | undefined) => {
  const isRoot = (folder: string) => folder === '/' || folder === home
  return docCwd === cwd || (isUnder(cwd, docCwd) && !isRoot(docCwd)) || (isUnder(docCwd, cwd) && !isRoot(cwd))
}

const asHandoffs = (value: unknown) => (Array.isArray(value) ? (value as Handoff[]) : [])

// Returns the list with matching docs marked resumed, or undefined when none changed.
const markResumed = (all: Handoff[], isMatch: (path: string) => boolean) =>
  all.some(doc => !doc.isResumed && isMatch(doc.path))
    ? all.map(doc => (isMatch(doc.path) ? { ...doc, isResumed: true } : doc))
    : undefined

const formatAge = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

const basename = (path: string) => path.split('/').filter(Boolean).slice(-2).join('/')

// Installs /handoff from skills.sh when it is missing: `universal` keeps the files in ~/.agents/skills and symlinks Claude Code's copy to them.
const INSTALL_COMMAND = 'npx -y skills add mattpocock/skills -s handoff -g -a universal claude-code -y'

// The terminal runs a `!` line as shell; the desktop app sends it to Claude as a message, so ask Claude there.
const installPrompt = (surface: string) =>
  surface === 'terminal'
    ? `! ${INSTALL_COMMAND}`
    : `Install the /handoff skill by running this shell command: ${INSTALL_COMMAND}`

// The reply is only the /handoff argument; it must stay one line because it is filled into the prompt.
const SUGGEST_PROMPT = [
  'This conversation is about to be handed off via /handoff to a fresh agent that has no memory of it.',
  'Your reply becomes the /handoff argument: it tells the handoff document what to focus on.',
  "State, from this conversation only: the user's current goal (their latest intent, not superseded ones);",
  'what is done and what is not; the exact next step; decisions or constraints the user set; approaches already ruled out.',
  'Name concrete files, commands and identifiers. Do not guess: leave out anything the conversation does not establish,',
  'and if the work is finished, say so instead of inventing a next step. Never include secrets.',
  'Reply with ONE line, at most 60 words, in the language the user writes in, parts separated by semicolons.',
  'No preamble, no quotes, no markdown.',
].join(' ')

const IDLE: Suggestion = { status: 'idle' }

const BAR_WIDTH = 20

const bar = (current: number, window: number) => {
  const filled = Math.min(BAR_WIDTH, Math.round((current / window) * BAR_WIDTH))
  return { filled: '▰'.repeat(filled), empty: '▱'.repeat(BAR_WIDTH - filled) }
}

// Desktop draws the fill as a real bar; the terminal has no Svg.
const barSvg = (current: number, window: number) => {
  const fill = Math.min(100, (current / window) * 100).toFixed(1)
  // No viewBox, so rx stays in pixels and both ends are true semicircles at any width.
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="6">',
    '<rect width="100%" height="6" rx="3" fill="#8883" />',
    `<rect width="${fill}%" height="6" rx="3" fill="#e0af68" />`,
    '</svg>',
  ].join('')
}

const formatK = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`)

const tokens = atom({ plugin: 'handoff-nudge', key: 'tokens' } as const, null)
const threshold = atom({ plugin: 'handoff-nudge', key: 'threshold' } as const, 0)
const contextWindow = atom({ plugin: 'handoff-nudge', key: 'window' } as const, 0)
const isHidden = atom({ plugin: 'handoff-nudge', key: 'isHidden' } as const, false)
const suggestion = atom({ plugin: 'handoff-nudge', key: 'suggestion' } as const, IDLE)
const hasHandoff = atom({ plugin: 'handoff-nudge', key: 'hasHandoff' } as const, true)
const isResumeHidden = atom({ plugin: 'handoff-nudge', key: 'isResumeHidden' } as const, false)
const isConversationEmpty = atom({ plugin: 'handoff-nudge', key: 'isConversationEmpty' } as const, true)

export const register: Register = (on, options) => {
  const chosen = Number.parseInt(String(options.nudgeThreshold), 10) * 1000
  // Remember each handoff doc this session writes, so the next session in this cwd can offer it.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || !isHandoffDoc(e.file_path, await $.env.get('TMPDIR'))) {
      return ran
    }
    const entry: Handoff = { path: e.file_path, cwd: await $.session.cwd(), at: await $.clock.now() }
    const kept = asHandoffs(await $.store.get(HANDOFFS_KEY)).filter(doc => doc.path !== entry.path)
    await $.store.set(HANDOFFS_KEY, [entry, ...kept].slice(0, MAX_KEPT))
    return ran
  })

  // A doc counts as resumed once Claude reads it, however its path got into the prompt.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const marked = markResumed(asHandoffs(await $.store.get(HANDOFFS_KEY)), path => path === e.file_path)
      if (marked) await $.store.set(HANDOFFS_KEY, marked)
    }
    return ran
  })

  // Re-arm the resume band for the next empty conversation (/clear keeps this session's state).
  on('prompt.submit', async ($, e, next) => {
    // Pressing Resume only fills the prompt; the doc counts as resumed once that prompt is sent.
    const marked = markResumed(asHandoffs(await $.store.get(HANDOFFS_KEY)), path => e.text.includes(path))
    if (marked) await $.store.set(HANDOFFS_KEY, marked)
    await update($, isResumeHidden, () => false)
    await update($, isConversationEmpty, () => false)
    return next(e)
  })

  // `claude --resume` / `--continue` start with turns already in the transcript.
  on('session.start', async ($, e, next) => {
    const isEmpty = (await $.session.turns()) === 0
    await update($, isConversationEmpty, () => isEmpty)
    return next(e)
  })

  // The band's drawing is cached; this write is what redraws it after /clear.
  // turns() can't tell: the cleared transcript starts with the /clear command, a user turn.
  on('session.end', async ($, e, next) => {
    await update($, isConversationEmpty, () => e.reason === 'clear')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    // Only an empty conversation (a new session or after /clear) is starting from a handoff.
    if (e.props.hasSurvey || (await read($, isResumeHidden)) || !(await read($, isConversationEmpty))) {
      return rest
    }

    const cwd = await $.session.cwd()
    const now = await $.clock.now()
    const home = await $.env.get('HOME')
    const candidates = asHandoffs(await $.store.get(HANDOFFS_KEY)).filter(
      doc => isNearby(doc.cwd, cwd, home) && !doc.isResumed && now - doc.at < MAX_AGE_MS,
    )
    const shown: Handoff[] = []
    for (const doc of candidates) {
      if (shown.length === MAX_SHOWN) break
      // The OS clears $TMPDIR on its own schedule; skip docs that are gone.
      if (await $.fs.exists(doc.path)) shown.push(doc)
    }
    if (shown.length === 0) {
      return rest
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const frame =
      e.surface === 'desktop'
        ? ({ rowGap: 1, paddingX: 1, paddingY: 1 } as const)
        : ({ borderStyle: 'round', borderColor: 'suggestion', paddingX: 1 } as const)

    const resume = async (doc: Handoff) => {
      await update($, isResumeHidden, () => true)
      // Trailing space: the user usually adds what to do next after the path.
      await $.prompt.fill({ text: `${doc.path} ` })
    }

    return (
      <Box flexDirection="column">
        {rest}
        <Box flexDirection="column" {...frame}>
          <Box justifyContent="space-between" alignItems="center" columnGap={2}>
            <Text color="suggestion" bold>
              ↻ Resume from a handoff
            </Text>
            <Button key="resume-hide" label="Hide" onPress={() => update($, isResumeHidden, () => true)} />
          </Box>
          {shown.map((doc, i) => (
            <Box key={doc.path} justifyContent="space-between" alignItems="center" columnGap={2}>
              <Text>
                {basename(doc.path)} <Text dimColor>· {formatAge(now - doc.at)}</Text>
              </Text>
              <Button key={`resume-${i}`} variant={i === 0 ? 'primary' : undefined} label="Resume" onPress={() => resume(doc)} />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  on('session.measure', async ($, e, next) => {
    const current = e.context.tokens ?? null
    await update($, tokens, () => current)
    await update($, contextWindow, () => e.context.window)
    // Only the breakdown says where auto-compaction runs; `summary` counts locally, sending nothing.
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const at = effectiveThreshold(chosen, e.context.window, context.breakdown?.autoCompactThreshold)
    await update($, threshold, () => at)

    // Re-arm the band once context drops back under the threshold (compact, /clear).
    if (current === null || current < at) {
      await update($, isHidden, () => false)
      await update($, suggestion, () => IDLE)
    } else {
      const found = (await $.command.list()).some(c => c.name === 'handoff')
      await update($, hasHandoff, () => found)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Keep what Claude Code and other mods draw here; the card goes below it.
    const rest = await next(e)
    const current = await read($, tokens)
    const isQuiet =
      e.props.hasSurvey || current === null || current < (await read($, threshold)) || (await read($, isHidden))

    if (isQuiet) {
      return rest
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const window = await read($, contextWindow)
    const s = await read($, suggestion)
    const isMissing = !(await read($, hasHandoff))
    const percent = window > 0 ? Math.round((current / window) * 100) : undefined
    const { filled, empty } = bar(current, window)

    let meter: RenderChildren
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      meter = <Svg source={barSvg(current, window)} alt={`${percent}% of the context window used`} height={6} />
    } else {
      meter = (
        <Text>
          <Text color="warning">{filled}</Text>
          <Text dimColor>{empty}</Text>
        </Text>
      )
    }

    // The desktop band already sits in a panel: space the rows out instead of framing them.
    const frame =
      e.surface === 'desktop'
        ? ({ rowGap: 1, paddingX: 1, paddingY: 1 } as const)
        : ({ borderStyle: 'round', borderColor: 'warning', paddingX: 1 } as const)

    const card = (body: RenderChildren, buttons: RenderChildren, footer?: RenderChildren) => (
      <Box flexDirection="column">
        {rest}
        <Box flexDirection="column" {...frame}>
          <Box justifyContent="space-between">
            <Text color="warning" bold>
              ⚠ Context {formatK(current)}
              {window > 0 && <Text dimColor> / {formatK(window)}</Text>}
            </Text>
            {percent !== undefined && <Text dimColor>{percent}%</Text>}
          </Box>
          {window > 0 && meter}
          <Box justifyContent="space-between" alignItems="center" columnGap={2}>
            {body}
            <Box columnGap={1}>{buttons}</Box>
          </Box>
          {footer}
        </Box>
      </Box>
    )

    const hide = <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />

    if (isMissing) {
      return card(
        <Text dimColor>/handoff skill is not installed.</Text>,
        [<Button key="install" label="Install /handoff" onPress={press => $.prompt.fill({ text: installPrompt(press.surface) })} />, hide],
      )
    }

    const suggest = async () => {
      await update($, suggestion, () => ({ status: 'loading' }))
      const reply = await $.model.fork({ prompt: SUGGEST_PROMPT })
      const focus = reply.isAnswered ? reply.text.trim().split('\n')[0]?.trim() : undefined
      const result: Suggestion = focus
        ? { status: 'ready', focus }
        : { status: 'failed', reason: reply.isAnswered ? 'empty reply' : reply.reason }
      await update($, suggestion, () => result)
      if (focus) {
        await $.prompt.fill({ text: `/handoff ${focus}` })
      }
    }

    return card(
      <Text dimColor>Long session — hand off to a fresh one.</Text>,
      [
        <Button
          key="suggest"
          variant="primary"
          label={s.status === 'loading' ? 'Suggesting…' : 'Suggest handoff'}
          onPress={() => (s.status === 'loading' ? undefined : suggest())}
        />,
        hide,
      ],
      // A ready focus is already in the prompt; only a failure needs saying here.
      s.status === 'failed' ? <Text color="error">↳ Could not suggest: {s.reason}</Text> : undefined,
    )
  })
}
