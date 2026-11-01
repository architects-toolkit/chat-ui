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
