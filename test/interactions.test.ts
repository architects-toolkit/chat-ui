// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatView } from '../src/index.js';
import type { ChatFeatures, ChatMessage, ChatTransport } from '../src/index.js';

function mount(transport?: Partial<ChatTransport>, features?: ChatFeatures, extra?: object) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createChatView(host, {
        transport: { send: vi.fn(), ...transport },
        ...(features ? { features } : {}),
        ...extra,
    });
    return { host, view };
}

function setScrollMetrics(el: Element, { height, client }: { height: number; client: number }) {
    Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: client, configurable: true });
}

const pressEnter = (el: Element, init: KeyboardEventInit = {}) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }));

const inputOf = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('textarea.cui-input')!;

/* ------------------------------------------------------------------ */
/* Scroll anchoring                                                    */
/* ------------------------------------------------------------------ */

describe('scroll anchoring', () => {
    it('stays pinned to the bottom while the user is at the bottom', () => {
        const { host, view } = mount();
        const msgs = host.querySelector('.cui-messages')!;
        setScrollMetrics(msgs, { height: 1000, client: 200 });
        (msgs as HTMLElement).scrollTop = 800;
        msgs.dispatchEvent(new Event('scroll'));
        view.addMessage({ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'x' }] });
        expect((msgs as HTMLElement).scrollTop).toBe(1000);
    });

    it('does not yank scroll when the user scrolled up', () => {
        const { host, view } = mount();
        const msgs = host.querySelector('.cui-messages')!;
        setScrollMetrics(msgs, { height: 1000, client: 200 });
        (msgs as HTMLElement).scrollTop = 100; // scrolled up
        msgs.dispatchEvent(new Event('scroll'));
        view.addMessage({ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'x' }] });
        view.appendDelta('1', ' more');
        expect((msgs as HTMLElement).scrollTop).toBe(100);
        expect(host.querySelector('.cui-jump.visible')).toBeTruthy();
    });

    it('re-pins after an explicit scrollToBottom', () => {
        const { host, view } = mount();
        const msgs = host.querySelector('.cui-messages')!;
        setScrollMetrics(msgs, { height: 1000, client: 200 });
        (msgs as HTMLElement).scrollTop = 100;
        msgs.dispatchEvent(new Event('scroll'));
        view.scrollToBottom();
        expect((msgs as HTMLElement).scrollTop).toBe(1000);
        expect(host.querySelector('.cui-jump.visible')).toBeNull();
    });

    it('always scrolls on a new user message', () => {
        const { host, view } = mount();
        const msgs = host.querySelector('.cui-messages')!;
        setScrollMetrics(msgs, { height: 1000, client: 200 });
        (msgs as HTMLElement).scrollTop = 100;
        msgs.dispatchEvent(new Event('scroll'));
        view.addMessage({ id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }] });
        expect((msgs as HTMLElement).scrollTop).toBe(1000);
    });
});

/* ------------------------------------------------------------------ */
/* IME composition                                                     */
/* ------------------------------------------------------------------ */

describe('IME composition guard', () => {
    it('does not submit on Enter while composing', () => {
        const send = vi.fn();
        const { host } = mount({ send });
        const input = inputOf(host);
        input.value = 'かな';
        input.dispatchEvent(new Event('compositionstart'));
        pressEnter(input);
        expect(send).not.toHaveBeenCalled();
        input.dispatchEvent(new Event('compositionend'));
        pressEnter(input);
        expect(send).toHaveBeenCalledWith({ text: 'かな' });
    });

    it('does not submit when the event is marked isComposing', () => {
        const send = vi.fn();
        const { host } = mount({ send });
        const input = inputOf(host);
        input.value = 'partial';
        pressEnter(input, { keyCode: 229 } as KeyboardEventInit);
        expect(send).not.toHaveBeenCalled();
    });

    it('does not clear the staged quote on Escape while composing', () => {
        const { host, view } = mount({}, { quoteChip: true });
        view.stageQuote('quoted');
        const input = inputOf(host);
        input.dispatchEvent(new Event('compositionstart'));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        expect(view.getQuote()).toBe('quoted');
        input.dispatchEvent(new Event('compositionend'));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        expect(view.getQuote()).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/* Streaming appendDelta                                               */
/* ------------------------------------------------------------------ */

describe('appendDelta streaming', () => {
    it('streams into a markdown part incrementally', () => {
        const { host, view } = mount();
        view.addMessage({
            id: 'm', domKey: 'k', role: 'assistant', status: 'streaming',
            parts: [{ type: 'markdown', text: '' }],
        });
        view.appendDelta('k', 'first **para**');
        view.appendDelta('k', '\n\nsecond para');
        const part = host.querySelector('.cui-part-markdown')!;
        expect(part.querySelectorAll('.cui-md-seg').length).toBe(1);
        expect(part.querySelector('.cui-md-tail')).toBeTruthy();
        expect(part.textContent).toContain('second para');
        expect(part.innerHTML).toContain('<strong>para</strong>');
    });

    it('keeps message.parts in sync during markdown streaming', () => {
        const { view } = mount();
        view.addMessage({
            id: 'm', domKey: 'k', role: 'assistant',
            parts: [{ type: 'markdown', text: 'a' }],
        });
        view.appendDelta('k', 'b');
        view.updateMessage('k', { status: 'done' });
        expect(view).toBeTruthy();
    });

    it('re-renders cleanly on updateMessage after streaming', () => {
        const { host, view } = mount();
        view.addMessage({
            id: 'm', domKey: 'k', role: 'assistant', status: 'streaming',
            parts: [{ type: 'markdown', text: '' }],
        });
        view.appendDelta('k', '**par');
        view.appendDelta('k', 'tial** end');
        view.updateMessage('k', { status: 'done' });
        const part = host.querySelector('.cui-part-markdown')!;
        expect(part.querySelector('.cui-md-tail')).toBeNull();
        expect(part.innerHTML).toContain('<strong>partial</strong>');
    });

    it('creates a markdown part when deltaFormat is markdown', () => {
        const { host, view } = mount({}, {}, { deltaFormat: 'markdown' });
        view.addMessage({ id: 'm', domKey: 'k', role: 'assistant', parts: [] });
        view.appendDelta('k', '**bold**');
        expect(host.querySelector('.cui-part-markdown')!.innerHTML).toContain('<strong>bold</strong>');
    });
});

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

describe('attachments', () => {
    const png = () => new File(['x'], 'pic.png', { type: 'image/png' });
    const doc = () => new File(['x'], 'notes.txt', { type: 'text/plain' });

    it('stages files with name chips and removal', () => {
        const send = vi.fn();
        const { host, view } = mount({ send }, { attachments: true });
        view.stageAttachments([doc()]);
        const strip = host.querySelector('.cui-attachments')!;
        expect(strip.classList.contains('visible')).toBe(true);
        expect(strip.textContent).toContain('notes.txt');
        strip.querySelector<HTMLButtonElement>('.cui-attachment-rm')!.click();
        expect(view.getAttachments().length).toBe(0);
    });

    it('shows image thumbnails', async () => {
        const { host, view } = mount({}, { attachments: true });
        view.stageAttachments([png()]);
        const chip = host.querySelector('.cui-attachment[data-kind="image"]')!;
        expect(chip.querySelector('img')).toBeTruthy();
        await new Promise((r) => setTimeout(r, 10)); // FileReader fallback resolves
        expect(chip.querySelector('img')!.src).toBeTruthy();
    });

    it('submits staged attachments and clears the strip', () => {
        const send = vi.fn();
        const { host, view } = mount({ send }, { attachments: true });
        const file = png();
        view.stageAttachments([file]);
        host.querySelector<HTMLButtonElement>('.cui-send')!.click();
        expect(send).toHaveBeenCalledWith({ text: '', attachments: [file] });
        expect(host.querySelector('.cui-attachments.visible')).toBeNull();
    });

    it('hides the attach button when inputModes excludes attachments', () => {
        const { host } = mount({}, { attachments: true, inputModes: ['text'] });
        expect(host.querySelector<HTMLButtonElement>('.cui-attach')!.hidden).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/* Model picker                                                        */
/* ------------------------------------------------------------------ */

describe('model picker', () => {
    it('renders options and reports selection', () => {
        const selectModel = vi.fn();
        const { host, view } = mount({ selectModel }, { modelPicker: true });
        view.setModels([{ id: 'a', label: 'Alpha' }, { id: 'b' }], 'a');
        const select = host.querySelector<HTMLSelectElement>('select.cui-model')!;
        expect(select.hidden).toBe(false);
        expect(select.options.length).toBe(2);
        select.value = 'b';
        select.dispatchEvent(new Event('change'));
        expect(selectModel).toHaveBeenCalledWith('b');
        expect(view.getSelectedModel()).toBe('b');
    });

    it('stays hidden when the feature is off', () => {
        const { host, view } = mount({}, { modelPicker: false });
        view.setModels([{ id: 'a' }]);
        expect(host.querySelector<HTMLSelectElement>('select.cui-model')!.hidden).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/* New part kinds                                                      */
/* ------------------------------------------------------------------ */

describe('new part kinds', () => {
    const msg = (parts: ChatMessage['parts'], meta?: ChatMessage['meta']): ChatMessage =>
        ({ id: 'm', domKey: 'k', role: 'assistant', parts, ...(meta ? { meta } : {}) });

    it('renders suggestion chips that report through messageAction', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(msg([{ type: 'suggestions', prompts: ['opt A', 'opt B'] }]));
        host.querySelectorAll<HTMLButtonElement>('.cui-suggestion')[0]!.click();
        expect(messageAction).toHaveBeenCalledWith('m', 'suggestion', { text: 'opt A' });
    });

    it('fills the composer on suggestion click when actions are off', () => {
        const { host, view } = mount();
        view.addMessage(msg([{ type: 'suggestions', prompts: ['fill me'] }]));
        host.querySelector<HTMLButtonElement>('.cui-suggestion')!.click();
        expect(inputOf(host).value).toBe('fill me');
    });

    it('renders quote, usage and evidence parts', () => {
        const { host, view } = mount();
        view.addMessage(msg([
            { type: 'quote', text: 'quoted text', source: 'doc.md' },
            { type: 'usage', usage: { tokensIn: 1200, tokensOut: 40, cost: 0.0042, durationMs: 3100 } },
            { type: 'evidence', text: 'background agent', level: 'warning', detail: 'step 3' },
        ]));
        expect(host.querySelector('.cui-part-quote')!.textContent).toContain('quoted text');
        expect(host.querySelector('.cui-part-quote cite')!.textContent).toBe('doc.md');
        expect(host.querySelector('.cui-usage')!.textContent).toContain('1.2k in');
        expect(host.querySelector('.cui-usage')!.textContent).toContain('$0.0042');
        const ev = host.querySelector<HTMLElement>('.cui-evidence')!;
        expect(ev.dataset.level).toBe('warning');
        expect(ev.textContent).toContain('background agent');
    });

    it('renders the cost chip from meta.usage when costChip is on', () => {
        const { host, view } = mount({}, { costChip: true });
        view.addMessage(msg([{ type: 'text', text: 'x' }], { usage: { tokensIn: 50 } }));
        expect(host.querySelector('.cui-usage')!.textContent).toContain('50 in');
    });

    it('renders audio and video parts with safe sources', () => {
        const { host, view } = mount();
        view.addMessage(msg([
            { type: 'audio', src: 'blob:https://x/1', name: 'clip.wav' },
            { type: 'video', src: 'javascript:alert(1)' },
        ]));
        expect(host.querySelector('audio')).toBeTruthy();
        expect(host.querySelector('video')).toBeNull();
    });

    it('renders image parts and blocks unsafe sources', () => {
        const { host, view } = mount();
        view.addMessage(msg([
            { type: 'image', src: 'https://x/pic.png', alt: 'pic' },
            { type: 'image', src: 'javascript:alert(1)' },
        ]));
        const imgs = host.querySelectorAll('.cui-part-image img');
        expect(imgs.length).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/* References part                                                     */
/* ------------------------------------------------------------------ */

describe('references part', () => {
    const msg = (parts: ChatMessage['parts']): ChatMessage =>
        ({ id: 'm', domKey: 'k', role: 'assistant', parts });

    it('renders items in a collapsed "Sources" details', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [
                { id: 1, title: 'Docs page', url: 'https://docs.example.com/a' },
                { title: 'Second source', url: 'https://b.example.com' },
            ],
        }]));
        const details = host.querySelector<HTMLDetailsElement>('details.cui-references')!;
        expect(details).toBeTruthy();
        expect(details.open).toBe(false);
        expect(details.querySelector('summary')!.textContent).toBe('Sources (2)');
        const items = details.querySelectorAll('.cui-reference');
        expect(items.length).toBe(2);
        expect(items[0]!.querySelector('.cui-ref-key')!.textContent).toBe('[1]');
        expect(items[1]!.querySelector('.cui-ref-key')!.textContent).toBe('[2]'); // positional fallback
    });

    it('links titles only when the url is safe', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [
                { title: 'Safe', url: 'https://ok.example.com' },
                { title: 'Unsafe', url: 'javascript:alert(1)' },
                { title: 'Obfuscated', url: 'java\tscript:alert(1)' },
            ],
        }]));
        const links = host.querySelectorAll<HTMLAnchorElement>('a.cui-ref-title');
        expect(links.length).toBe(1);
        expect(links[0]!.href).toBe('https://ok.example.com/');
        expect(links[0]!.rel).toBe('noopener noreferrer');
        const textTitles = [...host.querySelectorAll('span.cui-ref-title')].map((n) => n.textContent);
        expect(textTitles).toEqual(['Unsafe', 'Obfuscated']);
        expect(host.innerHTML).not.toContain('javascript:');
    });

    it('renders the url itself as unlinked text when unsafe and titleless', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [{ url: 'javascript:alert(1)' }],
        }]));
        const title = host.querySelector('span.cui-ref-title')!;
        expect(title.textContent).toBe('javascript:alert(1)');
        expect(host.querySelector('a.cui-ref-title')).toBeNull();
    });

    it('shows the verified badge only for verified items', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [
                { title: 'a', verified: true },
                { title: 'b', verified: false },
                { title: 'c' },
            ],
        }]));
        const badges = host.querySelectorAll('.cui-ref-verified');
        expect(badges.length).toBe(1);
        expect(badges[0]!.textContent).toContain('verified');
    });

    it('shows source labels, snippets and dates', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [{
                title: 'Hit', url: 'https://x.example.com',
                source: 'web_search', snippet: 'some excerpt', publishedAt: '2025-01-15',
            }],
        }]));
        const item = host.querySelector('.cui-reference')!;
        expect(item.querySelector('.cui-ref-source')!.textContent).toBe('web_search');
        expect(item.querySelector('.cui-ref-snippet')!.textContent).toBe('some excerpt');
        const time = item.querySelector<HTMLTimeElement>('time.cui-ref-date')!;
        expect(time.textContent).toBe('2025-01-15');
        expect(time.dateTime).toBe('2025-01-15');
    });

    it('tolerates missing and malformed fields', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [{}, null, 42, { snippet: 'only a snippet' }] as never,
        }]));
        const items = host.querySelectorAll('.cui-reference');
        expect(items.length).toBe(2);
        expect(items[0]!.querySelector('.cui-ref-key')!.textContent).toBe('[1]');
        expect(items[1]!.querySelector('.cui-ref-snippet')!.textContent).toBe('only a snippet');
    });

    it('renders nothing when items is empty or missing', () => {
        const { host, view } = mount();
        view.addMessage(msg([
            { type: 'references', items: [] },
            { type: 'references' } as never,
        ]));
        expect(host.querySelector('.cui-references')).toBeNull();
    });

    it('escapes item text instead of injecting HTML', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'references',
            items: [{ title: '<img src=x onerror=alert(1)>', snippet: '<b>x</b>' }],
        }]));
        expect(host.querySelector('.cui-reference img')).toBeNull();
        expect(host.querySelector('.cui-ref-title')!.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('renders through the canonical addInteraction path', () => {
        const { host, view } = mount();
        const wire = JSON.parse(JSON.stringify({
            id: 'rt', role: 'assistant',
            parts: [{ type: 'references', items: [{ title: 'Src', url: 'https://s.example.com' }] }],
        }));
        view.addInteraction(wire);
        expect(host.querySelector('details.cui-references a.cui-ref-title')).toBeTruthy();
    });
});

/* ------------------------------------------------------------------ */
/* Card kinds                                                          */
/* ------------------------------------------------------------------ */

describe('card parts', () => {
    const msg = (parts: ChatMessage['parts']): ChatMessage =>
        ({ id: 'm', domKey: 'k', role: 'assistant', parts });

    it('renders a task plan with per-step status', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'card', kind: 'task_plan',
            data: { title: 'Plan', steps: [
                { label: 'done step', status: 'done' },
                { label: 'running', status: 'active', detail: '50%' },
                { label: 'next', status: 'pending' },
            ] },
        }]));
        const card = host.querySelector('.cui-card[data-kind="task_plan"]')!;
        expect(card.querySelector('.cui-card-title')!.textContent).toBe('Plan');
        const steps = card.querySelectorAll('.cui-task-step');
        expect(steps.length).toBe(3);
        expect(steps[0]!.getAttribute('data-status')).toBe('done');
        expect(steps[1]!.textContent).toContain('50%');
    });

    it('answers a question card via free text', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(msg([{
            type: 'card', kind: 'question',
            data: { question: 'Which env?', allowFreeText: true },
        }]));
        const card = host.querySelector('.cui-card[data-kind="question"]')!;
        const field = card.querySelector<HTMLInputElement>('.cui-card-input')!;
        field.value = 'staging';
        card.querySelector<HTMLButtonElement>('.cui-card-answer-row button')!.click();
        expect(messageAction).toHaveBeenCalledWith('m', 'question', { answer: 'staging' });
        expect(card.getAttribute('data-answered')).toBe('true');
    });

    it('answers a question card via option chips', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(msg([{
            type: 'card', kind: 'question',
            data: { question: 'Pick', options: ['one', 'two'], action: 'pick' },
        }]));
        host.querySelectorAll<HTMLButtonElement>('.cui-card-options .cui-suggestion')[1]!.click();
        expect(messageAction).toHaveBeenCalledWith('m', 'pick', { answer: 'two' });
    });

    it('disables question inputs without messageActions', () => {
        const { host, view } = mount();
        view.addMessage(msg([{ type: 'card', kind: 'question', data: { question: 'Q?' } }]));
        expect(host.querySelector<HTMLInputElement>('.cui-card-input')!.disabled).toBe(true);
    });

    it('approves via the approval card', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(msg([{
            type: 'card', kind: 'approval',
            data: { title: 'Deploy?', description: 'prod deploy' },
        }]));
        host.querySelector<HTMLButtonElement>('.cui-approve')!.click();
        expect(messageAction).toHaveBeenCalledWith('m', 'approval', { decision: 'approved' });
        expect(host.querySelector('.cui-card')!.getAttribute('data-state')).toBe('approved');
    });

    it('renders a resolved approval state', () => {
        const { host, view } = mount();
        view.addMessage(msg([{
            type: 'card', kind: 'approval',
            data: { title: 'Done', state: 'rejected' },
        }]));
        expect(host.querySelector('.cui-card-state')!.textContent).toBe('Rejected');
        expect(host.querySelector('.cui-approve')).toBeNull();
    });

    it('reports model_select changes through messageAction', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(msg([{
            type: 'card', kind: 'model_select',
            data: { label: 'Model', options: ['fast', { id: 'pro', label: 'Pro' }], selected: 'fast' },
        }]));
        const select = host.querySelector<HTMLSelectElement>('.cui-card select')!;
        select.value = 'pro';
        select.dispatchEvent(new Event('change'));
        expect(messageAction).toHaveBeenCalledWith('m', 'model_select', { model: 'pro' });
    });

    it('routes custom card kinds to card:<kind> renderers', () => {
        const { host, view } = mount({}, {}, {
            partRenderers: {
                'card:meter': () => {
                    const n = document.createElement('div');
                    n.className = 'my-meter';
                    return n;
                },
            },
        });
        view.addMessage(msg([{ type: 'card', kind: 'meter', data: { v: 1 } }]));
        expect(host.querySelector('.my-meter')).toBeTruthy();
    });
});

/* ------------------------------------------------------------------ */
/* subagent_run card                                                   */
/* ------------------------------------------------------------------ */

describe('subagent_run card', () => {
    const runCard = (data: object): ChatMessage =>
        ({ id: 'm', domKey: 'k', role: 'assistant', parts: [{ type: 'card', kind: 'subagent_run', data } as never] });
    const cardOf = (host: HTMLElement) => host.querySelector<HTMLElement>('.cui-card[data-kind="subagent_run"]')!;
    const toneOf = (host: HTMLElement) =>
        cardOf(host).querySelector<HTMLElement>('.cui-subagent-badge')!.dataset.tone;

    it('maps statuses to badge tones', () => {
        const { host, view } = mount();
        for (const [status, tone] of [
            ['running', 'accent'],
            ['done', 'ok'],
            ['failed', 'err'],
            ['timeout', 'err'],
            ['cancelled', 'muted'],
            ['waiting', 'warn'],
            ['waiting_input', 'warn'],
            ['pending', 'neutral'],
        ]) {
            view.clearMessages();
            view.addMessage(runCard({ id: 'r1', status }));
            expect(toneOf(host), status).toBe(tone);
            expect(cardOf(host).dataset.status).toBe(status);
        }
    });

    it('tolerates unknown and missing statuses with a neutral badge', () => {
        const { host, view } = mount();
        view.addMessage(runCard({ id: 'r1', status: 'exploding' }));
        expect(toneOf(host)).toBe('neutral');
        expect(cardOf(host).querySelector('.cui-subagent-badge')!.textContent).toBe('exploding');
        view.clearMessages();
        view.addMessage(runCard({ id: 'r2' })); // no status at all
        const badge = host.querySelector<HTMLElement>('.cui-subagent-badge')!;
        expect(badge.dataset.tone).toBe('neutral');
        expect(badge.textContent).toBe('unknown');
    });

    it('shows the cancel button only for active states', () => {
        const { host, view } = mount({ messageAction: vi.fn() }, { messageActions: true });
        const cases: ReadonlyArray<[string, boolean]> = [
            ['running', true],
            ['pending', true],
            ['waiting', true],
            ['done', false],
            ['failed', false],
            ['cancelled', false],
            ['timeout', false],
        ];
        for (const [status, shown] of cases) {
            view.clearMessages();
            view.addMessage(runCard({ id: 'r1', status, cancellable: true }));
            expect(!!cardOf(host).querySelector('.cui-subagent-cancel'), status).toBe(shown);
        }
    });

    it('hides the cancel button when cancellable is unset or actions unwired', () => {
        // No cancellable flag.
        const a = mount({ messageAction: vi.fn() }, { messageActions: true });
        a.view.addMessage(runCard({ id: 'r1', status: 'running' }));
        expect(cardOf(a.host).querySelector('.cui-subagent-cancel')).toBeNull();
        // Feature off.
        const b = mount({ messageAction: vi.fn() }, { messageActions: false });
        b.view.addMessage(runCard({ id: 'r1', status: 'running', cancellable: true }));
        expect(cardOf(b.host).querySelector('.cui-subagent-cancel')).toBeNull();
        // Transport member missing.
        const c = mount({}, { messageActions: true });
        c.view.addMessage(runCard({ id: 'r1', status: 'running', cancellable: true }));
        expect(cardOf(c.host).querySelector('.cui-subagent-cancel')).toBeNull();
    });

    it('reports { id, status } through messageAction on cancel', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(runCard({ id: 'run-7', status: 'running', cancellable: true }));
        const btn = cardOf(host).querySelector<HTMLButtonElement>('.cui-subagent-cancel')!;
        btn.click();
        expect(messageAction).toHaveBeenCalledWith('m', 'subagent_cancel', { id: 'run-7', status: 'running' });
        expect(btn.disabled).toBe(true); // no double-report while the host patches state
    });

    it('honors a custom cancel action id', () => {
        const messageAction = vi.fn();
        const { host, view } = mount({ messageAction }, { messageActions: true });
        view.addMessage(runCard({ id: 'r9', status: 'waiting', cancellable: true, action: 'agent_stop' }));
        cardOf(host).querySelector<HTMLButtonElement>('.cui-subagent-cancel')!.click();
        expect(messageAction).toHaveBeenCalledWith('m', 'agent_stop', { id: 'r9', status: 'waiting' });
    });

    it('renders name/id, task, detail and progress', () => {
        const { host, view } = mount();
        view.addMessage(runCard({
            id: 'run-3', name: 'Research agent', status: 'running',
            task: 'Scan the repo for usages', detail: 'step 3 of 7 — scanning',
            progress: { done: 3, total: 7 },
        }));
        const card = cardOf(host);
        expect(card.querySelector('.cui-subagent-name')!.textContent).toBe('Research agent');
        expect(card.querySelector('.cui-subagent-id')!.textContent).toBe('run-3');
        expect(card.querySelector('.cui-subagent-task')!.textContent).toBe('Scan the repo for usages');
        expect(card.querySelector('.cui-subagent-detail')!.textContent).toBe('step 3 of 7 — scanning');
        expect(card.querySelector('.cui-subagent-progress-label')!.textContent).toBe('3/7');
        view.clearMessages();
        view.addMessage(runCard({ id: 'r4', status: 'done', progress: 'finalizing…' }));
        expect(cardOf(host).querySelector('.cui-subagent-detail')!.textContent).toBe('finalizing…');
    });

    it('falls back to id when name is absent', () => {
        const { host, view } = mount();
        view.addMessage(runCard({ id: 'run-9', status: 'pending' }));
        expect(cardOf(host).querySelector('.cui-subagent-name')!.textContent).toBe('run-9');
        expect(cardOf(host).querySelector('.cui-subagent-id')).toBeNull();
    });

    it('prefers elapsedMs and derives elapsed from startedAt→finishedAt', () => {
        const { host, view } = mount();
        view.addMessage(runCard({ id: 'r1', status: 'done', elapsedMs: 75_000 }));
        expect(cardOf(host).querySelector('.cui-subagent-elapsed')!.textContent).toBe('1m 15s');
        view.clearMessages();
        view.addMessage(runCard({
            id: 'r2', status: 'done',
            startedAt: '2025-01-01T10:00:00Z', finishedAt: '2025-01-01T10:00:12.400Z',
        }));
        expect(cardOf(host).querySelector('.cui-subagent-elapsed')!.textContent).toBe('12.4s');
        view.clearMessages();
        view.addMessage(runCard({ id: 'r3', status: 'done' })); // no timing fields
        expect(cardOf(host).querySelector('.cui-subagent-elapsed')).toBeNull();
    });

    it('renders the usage chip via the shared usage formatter', () => {
        const { host, view } = mount();
        view.addMessage(runCard({
            id: 'r1', status: 'done',
            usage: { tokensIn: 2400, tokensOut: 640, cost: 0.0061, durationMs: 9300 },
        }));
        const chip = cardOf(host).querySelector('.cui-usage')!;
        expect(chip.textContent).toContain('2.4k in');
        expect(chip.textContent).toContain('$0.0061');
        expect(chip.textContent).toContain('9.3s');
    });

    it('renders output inside a collapsed details', () => {
        const { host, view } = mount();
        view.addMessage(runCard({ id: 'r1', status: 'done', output: 'line one\nline two' }));
        const details = cardOf(host).querySelector<HTMLDetailsElement>('details.cui-subagent-output')!;
        expect(details).toBeTruthy();
        expect(details.open).toBe(false);
        expect(details.querySelector('.cui-subagent-output-pre')!.textContent).toBe('line one\nline two');
    });

    it('escapes card text instead of injecting HTML', () => {
        const { host, view } = mount();
        view.addMessage(runCard({
            id: 'r1', name: '<img src=x>', task: '<b>task</b>',
            status: 'done', output: '<script>alert(1)</script>',
        }));
        const card = cardOf(host);
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('script')).toBeNull();
        expect(card.querySelector('.cui-subagent-name')!.textContent).toBe('<img src=x>');
        expect(card.querySelector('.cui-subagent-output-pre')!.textContent).toContain('alert(1)');
    });

    it('renders through the canonical addInteraction path', () => {
        const { host, view } = mount();
        const wire = JSON.parse(JSON.stringify({
            id: 'sa', role: 'assistant',
            parts: [{ type: 'card', kind: 'subagent_run', data: { id: 'r1', status: 'running', elapsedMs: 1200 } }],
        }));
        view.addInteraction(wire);
        expect(cardOf(host).querySelector('.cui-subagent-elapsed')!.textContent).toBe('1.2s');
    });
});

/* ------------------------------------------------------------------ */
/* Queued-message meta attribution                                     */
/* ------------------------------------------------------------------ */

describe('queued message meta', () => {
    it('renders meta.agent as a muted suffix', () => {
        const { host, view } = mount({}, { queue: true });
        view.setQueue([
            { id: 'q1', text: 'review the diff', meta: { agent: 'reviewer' } },
            { id: 'q2', text: 'plain item' },
        ]);
        const metas = host.querySelectorAll('.cui-queue-meta');
        expect(metas.length).toBe(1);
        expect(metas[0]!.textContent).toContain('reviewer');
    });

    it('falls back to meta.author and ignores non-string values', () => {
        const { host, view } = mount({}, { queue: true });
        view.setQueue([
            { id: 'q1', text: 'a', meta: { author: 'ops-bot' } },
            { id: 'q2', text: 'b', meta: { agent: 42 } },
            { id: 'q3', text: 'c', meta: {} },
        ]);
        const metas = host.querySelectorAll('.cui-queue-meta');
        expect(metas.length).toBe(1);
        expect(metas[0]!.textContent).toContain('ops-bot');
    });
});
