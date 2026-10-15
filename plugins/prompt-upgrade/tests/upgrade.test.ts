import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PROPS = {
  title: 'Prompt upgrade',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const ORIGINAL = 'Build me a 30-day marketing plan for a pizza company.'

const QUESTIONS = JSON.stringify({
  questions: [
    { question: "What's the main goal of this 30-day plan?", options: ['More online orders', 'More foot traffic'] },
    { question: 'What marketing budget should the plan assume?', options: ['Under $500', '$500 to $2,000'] },
  ],
})

const REWRITE = '```json\n' + JSON.stringify({ prompt: 'I run a pizza chain and need a 30-day plan to grow online orders.', added: ['Set the goal as more online orders'] }) + '\n```'

const answer = (text: string) => ({ value: { isAnswered: true as const, text, usage: USAGE } })

// The engine beneath the mod: a pane that places, and every prompt, fill, copy and toast recorded.
const world = (on: On, opts: { isPlaced?: boolean } = {}) => {
  const seen = { submitted: [] as string[], filled: [] as string[], copied: [] as string[], toasts: [] as string[], closed: [] as string[], asked: [] as string[] }
  mock.store(on)
  on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }))
  on('ui.open', () => ({ value: opts.isPlaced === false ? { isPlaced: false as const, reason: 'no surface places panes' } : { isPlaced: true as const } }))
  on('ui.close', (_$, e) => (seen.closed.push(e.id), { value: undefined }))
  on('ui.copy', (_$, e) => (seen.copied.push(e.text), { value: { isCopied: true as const } }))
  on('ui.toast', (_$, e) => (seen.toasts.push(e.text), { value: undefined }))
  on('prompt.submit', (_$, e) => (seen.submitted.push(e.text), { text: e.text }))
  on('prompt.fill', (_$, e) => (seen.filled.push(e.text), { isFilled: true }))
  return seen
}

// Answers each fork with the next reply, recording what the mod asked.
const forks = (on: On, seen: { asked: string[] }, replies: string[]) => {
  let n = 0
  on('model.fork', (_$, e) => (seen.asked.push(e.prompt), answer(replies[n++] ?? '')))
}

for (const surface of ['terminal', 'desktop'] as const) {
  const mount = ($: Engine) => $.ui.mount({ plugin: 'prompt-upgrade', surface, component: 'Pane', requestId: 'prompt-upgrade', props: PROPS })
  const run = ($: Engine, args: string) => $.command.run({ command: 'prompt-upgrade', args } as never)

  test(`${surface}: no prompt given shows how to use the command`, async ($, on) => {
    const seen = world(on)
    const ran = await run($, '  ')
    expect(ran.text).toContain('Usage: /prompt-upgrade <prompt>')
    expect(seen.asked).toEqual([])
  })

  test(`${surface}: questions lead with the recommended option, and Run it sends the upgraded prompt with the answers picked`, async ($, on) => {
    const seen = world(on)
    forks(on, seen, [QUESTIONS, REWRITE])
    await run($, ORIGINAL)

    const pane = await mount($)
    expect((await pane.find({ key: 'q0-0' }))?.text).toContain('(Recommended)')
    await pane.press({ key: 'q1-1' })
    await pane.press({ key: 'upgrade' })

    expect(seen.asked[0]).toContain(ORIGINAL)
    expect(seen.asked[1]).toContain('More online orders')
    expect(seen.asked[1]).toContain('$500 to $2,000')
    const review = JSON.stringify(await pane.drawn())
    expect(review).toContain('I run a pizza chain')
    expect(review).toContain('Set the goal as more online orders')

    await pane.press({ key: 'run' })
    expect(seen.submitted).toEqual(['I run a pizza chain and need a 30-day plan to grow online orders.'])
    expect(seen.closed).toEqual(['prompt-upgrade'])
  })

  test(`${surface}: Other takes typed text and Skip leaves the question out`, async ($, on) => {
    const seen = world(on)
    forks(on, seen, [QUESTIONS, REWRITE])
    await run($, ORIGINAL)

    const pane = await mount($)
    await pane.press({ key: 'q0-other' })
    await pane.input({ key: 'q0-text', text: 'Catering bookings' })
    await pane.press({ key: 'q1-skip' })
    await pane.press({ key: 'upgrade' })

    expect(seen.asked[1]).toContain('Catering bookings')
    expect(seen.asked[1]).not.toContain('Under $500')
  })

  test(`${surface}: a clear prompt skips the questions straight to review`, async ($, on) => {
    const seen = world(on)
    forks(on, seen, [JSON.stringify({ questions: [] }), REWRITE])
    await run($, ORIGINAL)

    expect(seen.asked).toHaveLength(2)
    expect(await (await mount($)).find({ key: 'run' })).toBeDefined()
  })

  test(`${surface}: Edit fills the upgraded prompt, Cancel fills the original back, Send original sends it`, async ($, on) => {
    const seen = world(on)
    forks(on, seen, [JSON.stringify({ questions: [] }), REWRITE, JSON.stringify({ questions: [] }), REWRITE, JSON.stringify({ questions: [] }), REWRITE])

    const pane = await mount($)
    await run($, ORIGINAL)
    await pane.press({ key: 'edit' })
    await run($, ORIGINAL)
    await pane.press({ key: 'cancel' })
    await run($, ORIGINAL)
    await pane.press({ key: 'original' })

    expect(seen.filled).toEqual(['I run a pizza chain and need a 30-day plan to grow online orders.', ORIGINAL])
    expect(seen.submitted).toEqual([ORIGINAL])
  })

  test(`${surface}: Copy puts the upgraded prompt on the clipboard and keeps the pane open`, async ($, on) => {
    const seen = world(on)
    forks(on, seen, [JSON.stringify({ questions: [] }), REWRITE])
    await run($, ORIGINAL)
    await (await mount($)).press({ key: 'copy' })

    expect(seen.copied).toEqual(['I run a pizza chain and need a 30-day plan to grow online orders.'])
    expect(seen.toasts).toEqual(['Copied'])
    expect(seen.closed).toEqual([])
  })

  test(`${surface}: a failed call offers Retry, which asks again`, async ($, on) => {
    const seen = world(on)
    let n = 0
    on('model.fork', (_$, e) => {
      seen.asked.push(e.prompt)
      return n++ === 0 ? { value: { isAnswered: false as const, reason: 'api-error' as const, status: 529, error: 'overloaded' as const, usage: USAGE } } : answer(JSON.stringify({ questions: [] }))
    })
    on('model.complete', () => answer(REWRITE))
    await run($, ORIGINAL)

    const failed = await mount($)
    expect(JSON.stringify(await failed.drawn())).toContain('api-error')
    await failed.press({ key: 'retry' })
    expect(seen.asked).toHaveLength(3)
  })

  test(`${surface}: a conversation with nothing to fork asks the session's model without history`, async ($, on) => {
    const seen = world(on)
    const models: string[] = []
    on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('model.complete', (_$, e) => (models.push(e.model), answer(models.length === 1 ? JSON.stringify({ questions: [] }) : REWRITE)))
    await run($, ORIGINAL)

    expect(models).toEqual(['claude-opus-5-5', 'claude-opus-5-5'])
    expect(await (await mount($)).find({ key: 'run' })).toBeDefined()
  })

  test(`${surface}: a pane that cannot be placed fills the original back and says so`, async ($, on) => {
    const seen = world(on, { isPlaced: false })
    forks(on, seen, [QUESTIONS])
    await run($, ORIGINAL)

    expect(seen.asked).toEqual([])
    expect(seen.filled).toEqual([ORIGINAL])
    expect(seen.toasts[0]).toContain('no surface places panes')
  })
}
