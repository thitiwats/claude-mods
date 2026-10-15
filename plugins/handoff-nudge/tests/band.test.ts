import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const measure = (tokens: number) => ({
  context: { tokens, window: 1_000_000 },
  rateLimits: [],
  changed: ['context' as const],
})

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine) =>
    $.ui.mount({ plugin: 'handoff-nudge', surface, component: 'AbovePrompt', props: PROPS })

  test(`${surface}: hidden under 200k, shown past it, hide re-arms after compaction`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))

    await $.session.measure(measure(150_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined()

    await $.session.measure(measure(210_000))
    const shown = await mount($)
    expect(await shown.find({ key: 'suggest' })).toBeDefined()
    expect(await shown.find({ key: 'fill' })).toBeUndefined()

    await shown.press({ key: 'hide' })
    expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined()

    await $.session.measure(measure(40_000))
    await $.session.measure(measure(220_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeDefined()
  })

  test(`${surface}: suggest forks the transcript and fills /handoff with the focus`, async ($, on) => {
    const filled: string[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    on('model.fork', () => ({
      value: { isAnswered: true as const, text: 'Finish the mod install\nextra line', usage: USAGE },
    }))
    on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }))

    await $.session.measure(measure(210_000))
    const ui = await mount($)
    await ui.press({ key: 'suggest' })

    expect(filled).toEqual(['/handoff Finish the mod install'])
    const after = await mount($)
    expect(JSON.stringify(await after.drawn())).toContain('Finish the mod install')
  })
}
