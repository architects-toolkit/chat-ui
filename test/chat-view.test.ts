// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatView } from '../src/index.js';
import type { ChatSubmit, ChatTransport, QueuedMessage } from '../src/index.js';

function mount(transport?: Partial<ChatTransport>, features = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createChatView(host, {
        transport: { send: vi.fn(), ...transport },
        features,
    });
    return { host, view };
}

describe('createChatView', () => {
    it('mounts the chat surface into the container', () => {
        const { host } = mount();
        expect(host.querySelector('.chat-ui')).toBeTruthy();
        expect(host.querySelector('.cui-messages')).toBeTruthy();
        expect(host.querySelector('textarea.cui-input')).toBeTruthy();
    });

    it('renders messages and replaces by domKey', () => {
        const { host, view } = mount();
        view.addMessage({ id: '1', domKey: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] });
        view.addMessage({ id: '1b', domKey: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'hi again' }] });
        const nodes = host.querySelectorAll('.cui-msg');
        expect(nodes.length).toBe(1);
        expect(nodes[0]!.textContent).toBe('hi again');
    });

    it('sends composer text through the transport', () => {
        const send = vi.fn();
        const { host } = mount({ send });
        const input = host.querySelector<HTMLTextAreaElement>('textarea.cui-input')!;
        input.value = 'hello there';
        host.querySelector<HTMLButtonElement>('.cui-send')!.click();
        expect(send).toHaveBeenCalledWith({ text: 'hello there' });
        expect(input.value).toBe('');
    });

    it('calls cancel when the stop button is clicked', () => {
        const cancel = vi.fn();
        const { host, view } = mount({ cancel });
        view.setProcessing(true);
        host.querySelector<HTMLButtonElement>('.cui-cancel')!.click();
        expect(cancel).toHaveBeenCalled();
    });

    it('appends streaming deltas to the text part', () => {
        const { host, view } = mount();
        view.addMessage({ id: 's', domKey: 's1', role: 'assistant', status: 'streaming', parts: [] });
        view.appendDelta('s1', 'Hello');
        view.appendDelta('s1', ', world');
        expect(host.querySelector('.cui-part-text')!.textContent).toBe('Hello, world');
    });

    it('renders the queue panel and routes queue actions', () => {
        const sendQueuedNow = vi.fn();
        const removeQueued = vi.fn();
        const items: QueuedMessage[] = [{ id: 'q1', text: 'later' }];
        const { host, view } = mount({ sendQueuedNow, removeQueued }, { queue: true });
        view.setQueue(items);
        const buttons = host.querySelectorAll<HTMLButtonElement>('.cui-queue-item button');
        expect(buttons.length).toBe(2);
        buttons[0]!.click();
        expect(sendQueuedNow).toHaveBeenCalledWith('q1');
        buttons[1]!.click();
        expect(removeQueued).toHaveBeenCalledWith('q1');
    });

    it('hides the queue panel when the feature is off', () => {
        const { host, view } = mount({}, { queue: false });
        view.setQueue([{ id: 'q1', text: 'x' }]);
        expect(host.querySelector('.cui-queue.visible')).toBeNull();
    });

    it('stages and clears the quote chip', () => {
        const { host, view } = mount({}, { quoteChip: true });
        view.stageQuote('original message');
        expect(view.getQuote()).toBe('original message');
        expect(host.querySelector('.cui-quote.visible')).toBeTruthy();
        host.querySelector<HTMLButtonElement>('.cui-quote button')!.click();
        expect(view.getQuote()).toBeNull();
    });

    it('feeds the context card', () => {
        const { host, view } = mount({}, { contextCard: true });
        view.setContextUsage({ percent: 42, elapsedMs: 30_000 });
        const card = host.querySelector('.cui-context-card');
        expect(card!.classList.contains('visible')).toBe(true);
        expect(card!.textContent).toContain('42%');
        expect(card!.textContent).toContain('30s');
    });

    it('calls transport.requestAttachments on attach click, with no file input created', () => {
        const requestAttachments = vi.fn();
        const { host } = mount({ requestAttachments }, { attachments: true });
        expect(host.querySelector('input[type="file"]')).toBeNull();
        host.querySelector<HTMLButtonElement>('.cui-attach')!.click();
        expect(requestAttachments).toHaveBeenCalledTimes(1);
    });

    it('sends host-staged attachments through submit and clears them after send', () => {
        const send = vi.fn();
        const { host, view } = mount({ send }, { attachments: true });
        const file = new File(['x'], 'note.txt', { type: 'text/plain' });
        const ref = { kind: 'audio', name: 'rec.ogg', url: 'blob:fake' };
        view.stageAttachments([file, ref]);
        expect(view.getAttachments().length).toBe(2);
        const input = host.querySelector<HTMLTextAreaElement>('textarea.cui-input')!;
        input.value = 'with attachments';
        host.querySelector<HTMLButtonElement>('.cui-send')!.click();
        expect(send).toHaveBeenCalledWith({ text: 'with attachments', attachments: [file, ref] });
        expect(view.getAttachments()).toEqual([]);
        expect(host.querySelector('.cui-attachments.visible')).toBeNull();
    });

    it('clicks the built-in file input when requestAttachments is absent', () => {
        const { host } = mount({}, { attachments: true });
        const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
        expect(fileInput).toBeTruthy();
        const clickSpy = vi.spyOn(fileInput, 'click');
        host.querySelector<HTMLButtonElement>('.cui-attach')!.click();
        expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('escapes markdown input instead of injecting HTML', () => {
        const { host, view } = mount();
        view.addMessage({
            id: 'md',
            role: 'assistant',
            parts: [{ type: 'markdown', text: '**bold** <script>alert(1)</script>' }],
        });
        expect(host.querySelector('strong')!.textContent).toBe('bold');
        expect(host.querySelector('script')).toBeNull();
    });
});
