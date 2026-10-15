import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Suggestion } from '../types'

const THRESHOLD = 200_000

// Filled into the prompt for the person to run when /handoff is missing (skills.sh).
const INSTALL_COMMAND = '! npx -y skills add mattpocock/skills -s handoff -g -a claude-code -y'

const SUGGEST_PROMPT = [
  'The conversation so far is about to be handed off to a fresh session via /handoff.',
  'Reply with ONE line (max 25 words, same language the user writes in) describing what the next session should focus on:',
  'the unfinished task and its next concrete step. No preamble, no quotes, no markdown.',
].join(' ')

const IDLE: Suggestion = { status: 'idle' }

const tokens = atom({ plugin: 'handoff-nudge', key: 'tokens' } as const, null)
const isHidden = atom({ plugin: 'handoff-nudge', key: 'isHidden' } as const, false)
const suggestion = atom({ plugin: 'handoff-nudge', key: 'suggestion' } as const, IDLE)
const hasHandoff = atom({ plugin: 'handoff-nudge', key: 'hasHandoff' } as const, true)

export const register: Register = on => {
  on('session.measure', async ($, e, next) => {
    const current = e.context.tokens ?? null
    await update($, tokens, () => current)

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
    const current = await read($, tokens)
    const isQuiet =
      e.props.hasSurvey || current === null || current < THRESHOLD || (await read($, isHidden))

    if (isQuiet) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const k = Math.round(current / 1000)
    const s = await read($, suggestion)

    if (!(await read($, hasHandoff))) {
      return (
        <Box>
          <Text color="warning">Context at {k}k tokens. The /handoff skill is not installed. </Text>
          <Button key="install" label="Install /handoff" onPress={() => $.prompt.fill({ text: INSTALL_COMMAND })} />
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
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

    return (
      <Box flexDirection="column">
        <Box>
          <Text color="warning">Context at {k}k tokens. Consider /handoff and starting a fresh session. </Text>
          <Button
            key="suggest"
            label={s.status === 'loading' ? 'Suggesting…' : 'Suggest handoff'}
            onPress={() => (s.status === 'loading' ? undefined : suggest())}
          />
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {s.status === 'ready' && <Text dimColor>Suggested focus: {s.focus}</Text>}
        {s.status === 'failed' && <Text dimColor>Could not suggest: {s.reason}</Text>}
      </Box>
    )
  })
}
