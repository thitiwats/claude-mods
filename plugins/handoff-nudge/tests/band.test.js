import { expect, test } from 'claude-code/testing';
const PROPS = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
};
const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const HANDOFF = { name: 'handoff', description: '', source: 'user' };
const measure = (tokens) => ({
    context: { tokens, window: 1000000 },
    rateLimits: [],
    changed: ['context'],
});
for (const surface of ['terminal', 'desktop']) {
    const mount = ($) => $.ui.mount({ plugin: 'handoff-nudge', surface, component: 'AbovePrompt', props: PROPS });
    test(`${surface}: hidden under 200k, shown past it, hide re-arms after compaction`, async ($, on) => {
        on('session.measure', (_$, e) => ({ changed: e.changed }));
        on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }));
        on('command.list', () => ({ value: [HANDOFF] }));
        await $.session.measure(measure(150000));
        expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined();
        await $.session.measure(measure(210000));
        const shown = await mount($);
        expect(await shown.find({ key: 'suggest' })).toBeDefined();
        expect(await shown.find({ key: 'fill' })).toBeUndefined();
        await shown.press({ key: 'hide' });
        expect(await (await mount($)).find({ key: 'suggest' })).toBeUndefined();
        await $.session.measure(measure(40000));
        await $.session.measure(measure(220000));
        expect(await (await mount($)).find({ key: 'suggest' })).toBeDefined();
    });
    test(`${surface}: card shows the context fill against the window`, async ($, on) => {
        on('session.measure', (_$, e) => ({ changed: e.changed }));
        on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }));
        on('command.list', () => ({ value: [HANDOFF] }));
        await $.session.measure(measure(210000));
        const drawn = JSON.stringify(await (await mount($)).drawn());
        expect(drawn).toContain('210k');
        expect(drawn).toContain('1M');
        expect(drawn).toContain(surface === 'desktop' ? '"type":"Svg"' : '"▰▰▰▰"');
    });
    test(`${surface}: missing /handoff fills the skills.sh install: a ! line on the terminal, a request to Claude on desktop`, async ($, on) => {
        const filled = [];
        on('session.measure', (_$, e) => ({ changed: e.changed }));
        on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }));
        on('command.list', () => ({ value: [] }));
        on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }));
        await $.session.measure(measure(210000));
        const ui = await mount($);
        expect(await ui.find({ key: 'suggest' })).toBeUndefined();
        await ui.press({ key: 'install' });
        const command = 'npx -y skills add mattpocock/skills -s handoff -g -a universal claude-code -y';
        expect(filled).toEqual([
            surface === 'terminal' ? `! ${command}` : `Install the /handoff skill by running this shell command: ${command}`,
        ]);
    });
    test(`${surface}: suggest forks the transcript and fills /handoff with the focus`, async ($, on) => {
        const filled = [];
        on('session.measure', (_$, e) => ({ changed: e.changed }));
        on('ui.render', () => ({ type: 'Box', props: { key: 'engine' }, children: [] }));
        on('command.list', () => ({ value: [HANDOFF] }));
        on('model.fork', () => ({
            value: { isAnswered: true, text: 'Finish the mod install\nextra line', usage: USAGE },
        }));
        on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }));
        await $.session.measure(measure(210000));
        const ui = await mount($);
        await ui.press({ key: 'suggest' });
        expect(filled).toEqual(['/handoff Finish the mod install']);
        const after = await mount($);
        expect(JSON.stringify(await after.drawn())).not.toContain('Finish the mod install');
    });
}
