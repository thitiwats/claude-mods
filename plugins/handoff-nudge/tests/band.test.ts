import { expect, mock, test } from 'claude-code/testing'
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

const HANDOFF = { name: 'handoff', description: '', source: 'user' as const }

const measure = (tokens: number, window = 1_000_000) => ({
  context: { tokens, window },
  rateLimits: [],
  changed: ['context' as const],
})

// Answers $.session.usage with where auto-compaction runs; undefined when it is off.
const usage = (autoCompactThreshold?: number) => () => ({
  value: { startedAt: 0, context: { window: 0, breakdown: { autoCompactThreshold } }, rateLimits: [] } as never,
})

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine) =>
    $.ui.mount({ plugin: 'handoff-nudge', surface, component: 'AbovePrompt', props: PROPS })

  test(`${surface}: hidden under 200k, shown past it, hide re-arms after compaction`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [HANDOFF] }))

    await $.prompt.submit({ text: 'hi' } as never)
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

  test(`${surface}: card shows the context fill against the window`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [HANDOFF] }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(210_000))
    const drawn = JSON.stringify(await (await mount($)).drawn())
    expect(drawn).toContain('210k')
    expect(drawn).toContain('1M')
    expect(drawn).toContain(surface === 'desktop' ? '"type":"Svg"' : '"▰▰▰▰"')
  })

  test(`${surface}: missing /handoff fills the skills.sh install: a ! line on the terminal, a request to Claude on desktop`, async ($, on) => {
    const filled: string[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [] }))
    on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(210_000))
    const ui = await mount($)
    expect(await ui.find({ key: 'suggest' })).toBeUndefined()
    await ui.press({ key: 'install' })

    const command = 'npx -y skills add mattpocock/skills -s handoff -g -a universal claude-code -y'
    expect(filled).toEqual([
      surface === 'terminal' ? `! ${command}` : `Install the /handoff skill by running this shell command: ${command}`,
    ])
  })

  test(`${surface}: suggest forks the transcript and fills /handoff with the focus`, async ($, on) => {
    const filled: string[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [HANDOFF] }))
    on('model.fork', () => ({
      value: { isAnswered: true as const, text: 'Finish the mod install\nextra line', usage: USAGE },
    }))
    on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(210_000))
    const ui = await mount($)
    await ui.press({ key: 'suggest' })

    expect(filled).toEqual(['/handoff Finish the mod install'])
    const after = await mount($)
    expect(JSON.stringify(await after.drawn())).not.toContain('Finish the mod install')
  })

  test(`${surface}: a plugin's /handoff skill counts as installed and fills under its plugin name`, async ($, on) => {
    const filled: string[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [{ ...HANDOFF, name: 'skills:handoff', source: 'plugin' as const }] }))
    on('model.fork', () => ({ value: { isAnswered: true as const, text: 'Finish the mod install', usage: USAGE } }))
    on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(210_000))
    const ui = await mount($)
    expect(await ui.find({ key: 'install' })).toBeUndefined()
    await ui.press({ key: 'suggest' })

    expect(filled).toEqual(['/skills:handoff Finish the mod install'])
  })

  test(`${surface}: a 300k nudge threshold stays hidden at 250k and shows past 300k`, { options: { nudgeThreshold: '300k' } }, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [HANDOFF] }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(250_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined()
    await $.session.measure(measure(310_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeDefined()
  })

  test(`${surface}: shows before auto-compaction when the threshold sits past it`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage(167_000))
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [HANDOFF] }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(140_000, 200_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined()
    await $.session.measure(measure(155_000, 200_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeDefined()
  })

  test(`${surface}: shows before the window fills when auto-compaction is off`, { options: { nudgeThreshold: '300k' } }, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.usage', usage())
    on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
    mock.store(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('command.list', () => ({ value: [HANDOFF] }))

    await $.prompt.submit({ text: 'hi' } as never)
    await $.session.measure(measure(170_000, 200_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined()
    await $.session.measure(measure(185_000, 200_000))
    expect(await (await mount($)).find({ key: 'suggest' })).toBeDefined()
  })
}
