/*
 * chat-ui — createChatView: the framework-agnostic mount.
 *
 * One function attaches a full chat surface to any element: a page in a
 * browser app, an embedded webview page, an Electron window, a widget.
 * The host drives it through ChatViewHandle; the view reports user intent
 * through ChatTransport. Rendering is plain DOM — no framework runtime.
 */

import { renderMarkdown } from './markdown.js';
import { DEFAULT_STYLES } from './styles.js';
import type {
    ChatMessage,
    ChatViewHandle,
    ChatViewOptions,
    MessagePart,
    PartRenderer,
    QueuedMessage,
} from './types.js';

const NS = 'chat-ui';

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

const partKey = (message: ChatMessage): string => message.domKey ?? message.id;

export function createChatView(container: HTMLElement, options: ChatViewOptions): ChatViewHandle {
    const doc = container.ownerDocument;
    const features = options.features ?? {};
    const customRenderers: Readonly<Record<string, PartRenderer>> = options.partRenderers ?? {};
    const transport = options.transport;

    if (!options.unstyled) {
        const style = doc.createElement('style');
        style.textContent = DEFAULT_STYLES;
        doc.head.appendChild(style);
    }

    const root = el(doc, 'div', NS);
    root.dataset.processing = 'false';

    const statusBar = el(doc, 'div', 'cui-status');

    const contextCard = el(doc, 'div', 'cui-context-card');
    const contextLabel = el(doc, 'span', '', 'Context');
    const contextMeter = el(doc, 'div', 'cui-context-meter');
    const contextFill = el(doc, 'i') as HTMLElement;
    contextMeter.appendChild(contextFill);
    const contextValue = el(doc, 'span');
    contextCard.append(contextLabel, contextMeter, contextValue);

    const messages = el(doc, 'div', 'cui-messages');
    messages.setAttribute('role', 'log');
    messages.setAttribute('aria-live', 'polite');

    const queuePanel = el(doc, 'div', 'cui-queue');

    const quote = el(doc, 'div', 'cui-quote');
    const quoteText = el(doc, 'div', 'cui-quote-text');
    const quoteDismiss = el(doc, 'button', '', '✕');
    quoteDismiss.setAttribute('aria-label', 'Remove quote');
    quote.append(quoteText, quoteDismiss);

    const composer = el(doc, 'div', 'cui-composer');
    const input = doc.createElement('textarea');
    input.className = 'cui-input';
    input.rows = 1;
    input.placeholder = options.placeholder ?? 'Type a message…';
    const attach = el(doc, 'button', 'cui-attach', '📎') as HTMLButtonElement;
    attach.type = 'button';
    attach.hidden = !features.attachments;
    const send = el(doc, 'button', 'cui-send', 'Send') as HTMLButtonElement;
    send.type = 'button';
    const cancel = el(doc, 'button', 'cui-cancel', 'Stop') as HTMLButtonElement;
    cancel.type = 'button';
    const fileInput = doc.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.hidden = true;
    composer.append(input, attach, send, cancel, fileInput);
    root.append(statusBar, contextCard, messages, queuePanel, quote, composer);
    container.appendChild(root);

    const byKey = new Map<string, { message: ChatMessage; node: HTMLElement; body: HTMLElement }>();
    let stagedQuote: string | null = null;
    let destroyed = false;

    const scrollToBottom = () => { messages.scrollTop = messages.scrollHeight; };

    const renderPart = (part: MessagePart, message: ChatMessage): HTMLElement | null => {
        const custom = customRenderers[part.type];
        if (custom) return custom(part, { message, ownerDocument: doc });

        switch (part.type) {
            case 'text':
                return el(doc, 'div', 'cui-part-text', part.text);
            case 'markdown': {
                const node = el(doc, 'div', 'cui-part-markdown');
                node.innerHTML = renderMarkdown(part.text);
                return node;
            }
            case 'html': {
                const node = el(doc, 'div', 'cui-part-html');
                node.innerHTML = part.html; // host-trusted markup
                return node;
            }
            case 'image': {
                const img = doc.createElement('img');
                img.src = part.src;
                img.alt = part.alt ?? '';
                img.style.maxWidth = '100%';
                return img;
            }
            case 'tool_call': {
                const node = el(doc, 'div', 'cui-part-tool_call');
                node.appendChild(el(doc, 'div', 'cui-tool-name', `⚙ ${part.name}`));
                if (part.args) node.appendChild(el(doc, 'pre', '', part.args));
                if (part.status) node.dataset.status = part.status;
                return node;
            }
            case 'tool_result': {
                const node = el(doc, 'div', 'cui-part-tool_result', part.content);
                node.dataset.error = String(Boolean(part.isError));
                return node;
            }
            case 'divider':
                return el(doc, 'hr');
            case 'card':
            default:
                return null; // custom kinds require a registered renderer
        }
    };

    const renderActions = (message: ChatMessage): HTMLElement | null => {
        if (!features.messageActions || !transport.messageAction) return null;
        const actions = message.meta?.['actions'];
        if (!Array.isArray(actions) || actions.length === 0) return null;
        const row = el(doc, 'div', 'cui-actions');
        for (const action of actions) {
            const a = action as { id?: string; label?: string; payload?: unknown };
            if (typeof a?.id !== 'string' || typeof a?.label !== 'string') continue;
            const btn = el(doc, 'button', '', a.label) as HTMLButtonElement;
            btn.type = 'button';
            btn.addEventListener('click', () => transport.messageAction?.(message.id, a.id as string, a.payload));
            row.appendChild(btn);
        }
        return row.childElementCount ? row : null;
    };

    const addMessage: ChatViewHandle['addMessage'] = (message) => {
        const key = partKey(message);
        const existing = byKey.get(key);
        if (existing) existing.node.remove();

        const node = el(doc, 'div', 'cui-msg');
        node.dataset.role = message.role;
        if (message.status) node.dataset.status = message.status;
        const body = el(doc, 'div', 'cui-bubble');
        for (const part of message.parts) {
            const rendered = renderPart(part, message);
            if (rendered) body.appendChild(rendered);
        }
        const actions = renderActions(message);
        if (actions) body.appendChild(actions);
        node.appendChild(body);
        messages.appendChild(node);
        byKey.set(key, { message, node, body });
        scrollToBottom();
    };

    const renderQueue = (items: readonly QueuedMessage[]) => {
        queuePanel.replaceChildren();
        queuePanel.classList.toggle('visible', items.length > 0);
        for (const item of items) {
            const row = el(doc, 'div', 'cui-queue-item');
            const text = el(doc, 'span', 'cui-queue-text', item.text);
            row.appendChild(text);

            const mkBtn = (label: string, title: string, onClick: () => void) => {
                const b = el(doc, 'button', '', label) as HTMLButtonElement;
                b.type = 'button';
                b.title = title;
                b.addEventListener('click', onClick);
                row.appendChild(b);
            };

            if (transport.editQueued) mkBtn('✎', 'Edit', () => {
                const next = doc.defaultView?.prompt('Edit message', item.text);
                if (next != null && next !== item.text) transport.editQueued?.(item.id, next);
            });
            if (transport.sendQueuedNow) mkBtn('➤', 'Send now', () => transport.sendQueuedNow?.(item.id));
            if (transport.removeQueued) mkBtn('✕', 'Remove', () => transport.removeQueued?.(item.id));
            queuePanel.appendChild(row);
        }
    };

    const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        const files = fileInput.files && fileInput.files.length ? Array.from(fileInput.files) : undefined;
        input.value = '';
        input.style.height = 'auto';
        fileInput.value = '';
        void transport.send(files ? { text, attachments: files } : { text });
    };

    send.addEventListener('click', submit);
    cancel.addEventListener('click', () => transport.cancel?.());
    attach.addEventListener('click', () => fileInput.click());
    quoteDismiss.addEventListener('click', () => handle.clearQuote());
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(); }
        else if (ev.key === 'Escape' && stagedQuote != null) { handle.clearQuote(); }
    });
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    });

    const handle: ChatViewHandle = {
        addMessage,
        updateMessage(domKey, patch) {
            const entry = byKey.get(domKey);
            if (!entry) return;
            const merged: ChatMessage = { ...entry.message, ...patch };
            addMessage(merged);
        },
        appendDelta(domKey, delta) {
            const entry = byKey.get(domKey);
            if (!entry) return;
            const textEl = entry.body.querySelector('.cui-part-text');
            if (textEl) {
                textEl.textContent = (textEl.textContent ?? '') + delta;
            } else {
                entry.body.appendChild(el(doc, 'div', 'cui-part-text', delta));
            }
            const parts = [...entry.message.parts];
            const idx = parts.findIndex(p => p.type === 'text');
            const merged = idx >= 0
                ? parts.map((p, i) => (i === idx && p.type === 'text' ? { ...p, text: p.text + delta } : p))
                : [...parts, { type: 'text', text: delta } as MessagePart];
            byKey.set(domKey, { ...entry, message: { ...entry.message, parts: merged } });
            scrollToBottom();
        },
        removeMessage(domKey) {
            const entry = byKey.get(domKey);
            if (entry) { entry.node.remove(); byKey.delete(domKey); }
        },
        clearMessages() {
            byKey.clear();
            messages.replaceChildren();
        },
        setQueue(items) {
            if (features.queue) renderQueue(items);
        },
        setProcessing(processing) {
            root.dataset.processing = String(processing);
            input.disabled = false;
        },
        setStatus(status) {
            statusBar.textContent = status;
        },
        setContextUsage(usage) {
            contextCard.classList.toggle('visible', usage != null);
            if (!usage) return;
            const pct = Math.max(0, Math.min(100, Math.round(usage.percent)));
            contextFill.style.width = `${pct}%`;
            contextValue.textContent = usage.elapsedMs != null
                ? `${pct}% · ${Math.round(usage.elapsedMs / 1000)}s`
                : `${pct}%`;
        },
        stageQuote(text) {
            stagedQuote = text;
            quoteText.textContent = text;
            quote.classList.add('visible');
        },
        getQuote: () => stagedQuote,
        clearQuote() {
            stagedQuote = null;
            quoteText.textContent = '';
            quote.classList.remove('visible');
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            byKey.clear();
            root.remove();
        },
    };

    return handle;
}
