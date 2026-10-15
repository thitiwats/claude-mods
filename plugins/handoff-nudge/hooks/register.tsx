import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren } from 'claude-code'

import type { Preview, Suggestion } from '../types'

const THRESHOLD = 200_000

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
const contextWindow = atom({ plugin: 'handoff-nudge', key: 'window' } as const, 0)
const isHidden = atom({ plugin: 'handoff-nudge', key: 'isHidden' } as const, false)
const suggestion = atom({ plugin: 'handoff-nudge', key: 'suggestion' } as const, IDLE)
const hasHandoff = atom({ plugin: 'handoff-nudge', key: 'hasHandoff' } as const, true)
const preview = atom({ plugin: 'handoff-nudge', key: 'preview' } as const, 'off')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff-nudge-preview',
      description: 'Toggle the handoff band on regardless of context size; "install" shows it as if /handoff were missing',
      argumentHint: '[install]',
    })

    return next(e)
  })

  // Shows the band under the threshold too, so its design can be checked in any session.
  on('command.run', { command: 'handoff-nudge-preview' }, async ($, e) => {
    const asked: Preview = e.args.trim() === 'install' ? 'install' : 'band'
    const mode = await update($, preview, was => (was === asked ? 'off' : asked))
    await update($, isHidden, () => false)

    const text = { off: 'Handoff band preview off.', band: 'Handoff band preview on.', install: 'Handoff band preview on, as if /handoff were missing.' }
    return { text: text[mode] }
  })

  on('session.measure', async ($, e, next) => {
    const current = e.context.tokens ?? null
    await update($, tokens, () => current)
    await update($, contextWindow, () => e.context.window)

    // Re-arm the band once context drops back under the threshold (compact, /clear).
    if (current === null || current < THRESHOLD) {
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
    const measured = await read($, tokens)
    const mode = await read($, preview)
    const current = mode !== 'off' ? (measured ?? 0) : measured
    const isQuiet =
      e.props.hasSurvey ||
      current === null ||
      (current < THRESHOLD && mode === 'off') ||
      (await read($, isHidden))

    if (isQuiet) {
      return rest
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const window = await read($, contextWindow)
    const s = await read($, suggestion)
    const isMissing = mode === 'install' || !(await read($, hasHandoff))
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
