import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const TMPDIR = '/var/folders/2b/abc/T/'
const HOME = '/w'
const DOC = `${TMPDIR}handoff-erp-structure.md`
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// The world a fresh session in /w/app sees: an empty conversation, every file present, Write succeeding.
const world = (on: On, opts: { cwd?: string; turns?: number; isPresent?: boolean; store?: Record<string, unknown> } = {}) => {
  mock.store(on, opts.store)
  mock.env(on, { TMPDIR, HOME })
  on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
  on('session.cwd', () => ({ value: opts.cwd ?? '/w/app' }))
  on('session.turns', () => ({ value: opts.turns ?? 0 }))
  on('fs.exists', () => ({ value: opts.isPresent ?? true }))
  on('tool.call', () => ({ result: { type: 'create', filePath: DOC, content: '', structuredPatch: [] } }) as never)
  return mock.clock(on, { now: 100 * DAY })
}

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine) =>
    $.ui.mount({ plugin: 'handoff-nudge', surface, component: 'AbovePrompt', props: PROPS })

  test(`${surface}: a handoff written here is offered in an empty conversation, and Resume fills its path`, async ($, on) => {
    const filled: string[] = []
    const clock = world(on)
    on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }))

    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()

    await $.tool.call({ tool: 'Write', file_path: DOC, content: '# Handoff' })
    await clock.advance(2 * HOUR)
    const ui = await mount($)
    expect(JSON.stringify(await ui.drawn())).toContain('2h ago')
    await ui.press({ key: 'resume-0' })

    expect(filled).toEqual([`${DOC} `])
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: writes outside the temp dir or not named handoff are not offered`, async ($, on) => {
    world(on)
    await $.tool.call({ tool: 'Write', file_path: '/w/app/docs/handoff.md', content: '' })
    await $.tool.call({ tool: 'Write', file_path: `${TMPDIR}notes.md`, content: '' })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: hidden in a conversation resumed at startup`, async ($, on) => {
    world(on, { turns: 3 })
    on('session.start', () => ({ cwd: '/w/app' }))
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    await $.session.start({ cwd: '/w/app', surface, isInteractive: true })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: hidden after /resume switches to another conversation`, async ($, on) => {
    world(on)
    on('session.end', () => ({ sessionId: 's' }))
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    const ui = await mount($)
    await $.session.end({ reason: 'resume' } as never)
    expect(await ui.find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: hidden when the doc is gone`, async ($, on) => {
    world(on, { isPresent: false })
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: hidden once the doc is older than a week`, async ($, on) => {
    const clock = world(on)
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    await clock.advance(8 * DAY)
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: a handoff from another project is not offered`, async ($, on) => {
    world(on, { store: { handoffs: [{ path: DOC, cwd: '/w/other', at: 100 * DAY }] } })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: a handoff written in a subfolder is offered at the project root`, async ($, on) => {
    world(on, { store: { handoffs: [{ path: DOC, cwd: '/w/app/web', at: 100 * DAY }] } })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeDefined()
  })

  test(`${surface}: a handoff written at the project root is offered in a subfolder`, async ($, on) => {
    world(on, { cwd: '/w/app/web', store: { handoffs: [{ path: DOC, cwd: '/w/app', at: 100 * DAY }] } })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeDefined()
  })

  test(`${surface}: a handoff written in the home folder or / is not offered in a project, nor one from a project in home`, async ($, on) => {
    world(on, { store: { handoffs: [{ path: DOC, cwd: HOME, at: 100 * DAY }, { path: `${TMPDIR}handoff-b.md`, cwd: '/', at: 100 * DAY }] } })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: a handoff from a project is not offered in the home folder`, async ($, on) => {
    world(on, { cwd: HOME, store: { handoffs: [{ path: DOC, cwd: '/w/app', at: 100 * DAY }] } })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: a resumed handoff is not offered again`, async ($, on) => {
    world(on, { store: { handoffs: [{ path: DOC, cwd: '/w/app', at: 100 * DAY, isResumed: true }] } })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  // /clear re-arms the band in the same session, so it shows what the store now says.
  const clear = ($: Engine) => $.session.end({ reason: 'clear' } as never)

  test(`${surface}: a handoff whose path was sent is not offered again`, async ($, on) => {
    world(on, { turns: 1 })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('session.end', () => ({ sessionId: 's' }))
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    await $.prompt.submit({ text: `${DOC} continue the plan` } as never)
    await clear($)
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: a handoff Claude read is not offered again`, async ($, on) => {
    world(on, { turns: 1 })
    on('session.end', () => ({ sessionId: 's' }))
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    await $.tool.call({ tool: 'Read', file_path: DOC })
    await clear($)
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  test(`${surface}: pressing Resume, then sending something else, keeps the handoff on offer`, async ($, on) => {
    world(on, { turns: 1 })
    on('prompt.fill', () => ({ isFilled: true }))
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('session.end', () => ({ sessionId: 's' }))
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    await (await mount($)).press({ key: 'resume-0' })
    await $.prompt.submit({ text: 'something else' } as never)
    await clear($)
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeDefined()
  })

  test(`${surface}: hide dismisses the band until the next prompt`, async ($, on) => {
    world(on)
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    const ui = await mount($)
    await ui.press({ key: 'resume-hide' })
    expect(await (await mount($)).find({ key: 'resume-0' })).toBeUndefined()
  })

  // The cleared transcript starts with the /clear command itself, so turns() stays 1.
  test(`${surface}: the band comes back on the same drawing after /clear`, async ($, on) => {
    world(on, { turns: 1 })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('session.end', () => ({ sessionId: 's' }))
    await $.tool.call({ tool: 'Write', file_path: DOC, content: '' })
    await $.prompt.submit({ text: 'hi' } as never)
    const ui = await mount($)
    expect(await ui.find({ key: 'resume-0' })).toBeUndefined()

    await $.session.end({ reason: 'clear' } as never)
    expect(await ui.find({ key: 'resume-0' })).toBeDefined()
  })
}
