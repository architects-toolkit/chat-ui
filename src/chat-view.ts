/*
 * chat-ui — createChatView: the framework-agnostic mount.
 *
 * One function attaches a full chat surface to any element: a page in a
 * browser app, an embedded webview page, an Electron window, a widget.
 * The host drives it through ChatViewHandle; the view reports user intent
 * through ChatTransport. Rendering is plain DOM — no framework runtime.
 *
 * Interaction hardening ported from Deep Chat
 * (https://github.com/OvidijusParsiunas/deep-chat, MIT — see
 * THIRD_PARTY_NOTICES.md):
 *   - scroll anchoring: capture "at bottom" before mutating the DOM and
 *     only re-pin when the user has not scrolled away;
 *   - IME composition guard: Enter/Escape are ignored between
 *     compositionstart and compositionend.
 */

import { interactionPatchToMessage, interactionToMessage } from './interactions.js';
import { MarkdownStreamRenderer } from './markdown-stream.js';
import { isSafeUrl, renderMarkdown, safeEmbedUrl } from './markdown.js';
import {
    attachmentKindOf,
    attachmentNameOf,
    createAttachmentPreview,
} from './attachments.js';
import type { AttachmentPreview } from './attachments.js';
import { DEFAULT_STYLES } from './styles.js';
import type {
    ApprovalCardData,
    ChatMessage,
    ChatModelOption,
    ChatSubmit,
    ChatViewHandle,
    ChatViewOptions,
    EvidenceLevel,
    MessagePart,
    ModelSelectCardData,
    PartRenderer,
    QuestionCardData,
    QueuedMessage,
    ReferenceItem,
    SubagentRunData,
    SubmitAttachment,
    TaskPlanCardData,
    UsageInfo,
} from './types.js';

const NS = 'chat-ui';
/** Distance-from-bottom (px) still considered "pinned" — generous for late-loading content. */
const NEAR_BOTTOM_PX = 24;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

const partKey = (message: ChatMessage): string => message.domKey ?? message.id;

const compactNumber = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);

function usageText(usage: UsageInfo): string {
    const bits: string[] = [];
    if (usage.label) bits.push(usage.label);
    if (usage.tokensIn != null) bits.push(`${compactNumber(usage.tokensIn)} in`);
    if (usage.tokensOut != null) bits.push(`${compactNumber(usage.tokensOut)} out`);
    if (usage.cost != null) bits.push(`${usage.currency ?? '$'}${usage.cost.toFixed(4)}`);
    if (usage.durationMs != null) bits.push(`${(usage.durationMs / 1000).toFixed(1)}s`);
    return bits.join(' · ');
}

/** `1234` → `1.2s` · `75_000` → `1m 15s` · `3_900_000` → `1h 5m` — run-card elapsed. */
const formatElapsed = (ms: number): string => {
    if (ms < 0) ms = 0;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
    return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
};

interface MessageEntry {
    message: ChatMessage;
    node: HTMLElement;
    body: HTMLElement;
    /** Rendered elements aligned with `message.parts` (null = unrendered). */
    partEls: (HTMLElement | null)[];
}

interface StreamState {
    renderer: MarkdownStreamRenderer;
    el: HTMLElement;
}

export function createChatView(container: HTMLElement, options: ChatViewOptions): ChatViewHandle {
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    const features = options.features ?? {};
    const customRenderers: Readonly<Record<string, PartRenderer>> = options.partRenderers ?? {};
    const transport = options.transport;
    const mdRender = (md: string): string => (options.renderMarkdown ?? renderMarkdown)(md);
    const attachmentsEnabled =
        features.attachments === true &&
        (!features.inputModes || features.inputModes.includes('attachments'));

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

    const messagesWrap = el(doc, 'div', 'cui-messages-wrap');
    const messages = el(doc, 'div', 'cui-messages');
    messages.setAttribute('role', 'log');
    messages.setAttribute('aria-live', 'polite');
    const jump = el(doc, 'button', 'cui-jump', '↓ Latest') as HTMLButtonElement;
    jump.type = 'button';
    messagesWrap.append(messages, jump);

    const queuePanel = el(doc, 'div', 'cui-queue');

    const quote = el(doc, 'div', 'cui-quote');
    const quoteText = el(doc, 'div', 'cui-quote-text');
    const quoteDismiss = el(doc, 'button', '', '✕');
    quoteDismiss.setAttribute('aria-label', 'Remove quote');
    quote.append(quoteText, quoteDismiss);

    const attachStrip = el(doc, 'div', 'cui-attachments');

    const composer = el(doc, 'div', 'cui-composer');
    const input = doc.createElement('textarea');
    input.className = 'cui-input';
    input.rows = 1;
    input.placeholder = options.placeholder ?? 'Type a message…';
    const modelSelect = doc.createElement('select');
    modelSelect.className = 'cui-model';
    modelSelect.hidden = true;
    modelSelect.setAttribute('aria-label', 'Model');
    const attach = el(doc, 'button', 'cui-attach', '📎') as HTMLButtonElement;
    attach.type = 'button';
    attach.hidden = !attachmentsEnabled;
    const send = el(doc, 'button', 'cui-send', 'Send') as HTMLButtonElement;
    send.type = 'button';
    const cancel = el(doc, 'button', 'cui-cancel', 'Stop') as HTMLButtonElement;
    cancel.type = 'button';
    // When the transport picks attachments itself (`requestAttachments`),
    // no built-in <input type=file> exists — the host stages its picks
    // through handle.stageAttachments(...) instead.
    const fileInput = transport.requestAttachments ? null : doc.createElement('input');
    if (fileInput) {
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.hidden = true;
        if (features.attachmentAccept) fileInput.accept = features.attachmentAccept;
    }
    composer.append(modelSelect, input, attach, send, cancel, ...(fileInput ? [fileInput] : []));
    root.append(statusBar, contextCard, messagesWrap, queuePanel, quote, attachStrip, composer);
    container.appendChild(root);

    const byKey = new Map<string, MessageEntry>();
    const streams = new Map<string, StreamState>();
    let stagedQuote: string | null = null;
    let staged: SubmitAttachment[] = [];
    let previews: AttachmentPreview[] = [];
    let destroyed = false;

    /* ---------------------------------------------------------------- */
    /* Scroll anchoring — ported from Deep Chat's MessagesBase approach:  */
    /* a "pinned" flag driven by the scroll position; content growth      */
    /* only re-pins when the user has not scrolled away. Instant          */
    /* scrollTop assignment = no motion, so prefers-reduced-motion is     */
    /* respected by construction.                                         */
    /* ---------------------------------------------------------------- */

    let pinned = true;
    const isNearBottom = (): boolean =>
        messages.scrollHeight - messages.clientHeight - messages.scrollTop <= NEAR_BOTTOM_PX;
    const applyScroll = (force = false): void => {
        if (force || pinned) {
            messages.scrollTop = messages.scrollHeight;
            pinned = true;
        }
        jump.classList.toggle('visible', !pinned);
    };
    messages.addEventListener('scroll', () => {
        pinned = isNearBottom();
        jump.classList.toggle('visible', !pinned);
    });
    jump.addEventListener('click', () => applyScroll(true));

    /* ---------------------------------------------------------------- */
    /* Composer autosize                                                  */
    /* ---------------------------------------------------------------- */

    const autosize = (): void => {
        input.style.height = 'auto';
        const max = parseFloat(win?.getComputedStyle(input).maxHeight ?? '') || 160;
        const next = Math.min(input.scrollHeight, max);
        input.style.height = `${next}px`;
        input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden';
    };

    /* ---------------------------------------------------------------- */
    /* Attachments                                                        */
    /* ---------------------------------------------------------------- */

    const revokePreviews = (): void => {
        for (const p of previews) {
            try {
                p.revoke();
            } catch {
                /* ignore */
            }
        }
        previews = [];
    };

    let previewGen = 0;
    const renderAttachmentStrip = (): void => {
        revokePreviews();
        attachStrip.replaceChildren();
        attachStrip.classList.toggle('visible', staged.length > 0);
        const gen = ++previewGen;
        staged.forEach((item, i) => {
            const kind = attachmentKindOf(item);
            const chip = el(doc, 'div', 'cui-attachment');
            chip.dataset.kind = kind;
            if (kind === 'image') {
                const img = doc.createElement('img');
                img.className = 'cui-attachment-thumb';
                img.alt = attachmentNameOf(item);
                void createAttachmentPreview(item).then((p) => {
                    // stale generation: strip re-rendered since this resolved
                    if (!p || gen !== previewGen) {
                        p?.revoke();
                        return;
                    }
                    previews.push(p);
                    img.src = p.url;
                });
                chip.appendChild(img);
            } else {
                const icon = kind === 'audio' ? '🔊' : kind === 'video' ? '🎬' : '📄';
                chip.appendChild(el(doc, 'span', 'cui-attachment-icon', icon));
            }
            chip.appendChild(el(doc, 'span', 'cui-attachment-name', attachmentNameOf(item)));
            const rm = el(doc, 'button', 'cui-attachment-rm', '✕') as HTMLButtonElement;
            rm.type = 'button';
            rm.setAttribute('aria-label', `Remove ${attachmentNameOf(item)}`);
            rm.addEventListener('click', () => {
                staged.splice(i, 1);
                renderAttachmentStrip();
            });
            chip.appendChild(rm);
            attachStrip.appendChild(chip);
        });
    };

    const stageItems = (items: readonly SubmitAttachment[]): void => {
        if (!attachmentsEnabled || items.length === 0) return;
        staged.push(...items);
        renderAttachmentStrip();
    };

    const clearStaged = (): void => {
        staged = [];
        renderAttachmentStrip();
    };

    fileInput?.addEventListener('change', () => {
        const files = fileInput.files ? Array.from(fileInput.files) : [];
        fileInput.value = '';
        stageItems(files);
    });
    input.addEventListener('paste', (ev) => {
        if (!attachmentsEnabled) return;
        const files = ev.clipboardData?.files;
        if (files && files.length) {
            ev.preventDefault();
            stageItems(Array.from(files));
        }
    });

    /* ---------------------------------------------------------------- */
    /* Model picker                                                       */
    /* ---------------------------------------------------------------- */

    const setModels = (models: readonly ChatModelOption[], selected?: string): void => {
        modelSelect.replaceChildren();
        for (const m of models) {
            const opt = doc.createElement('option');
            opt.value = m.id;
            opt.textContent = m.hint ? `${m.label ?? m.id} — ${m.hint}` : (m.label ?? m.id);
            modelSelect.appendChild(opt);
        }
        if (selected !== undefined) modelSelect.value = selected;
        modelSelect.hidden = !(features.modelPicker && models.length > 0);
    };
    modelSelect.addEventListener('change', () => transport.selectModel?.(modelSelect.value));

    /* ---------------------------------------------------------------- */
    /* Part renderers                                                     */
    /* ---------------------------------------------------------------- */

    const interactive = (): boolean => features.messageActions === true && !!transport.messageAction;
    const reportAction = (message: ChatMessage, action: string, payload?: unknown): void =>
        transport.messageAction?.(message.id, action, payload);

    const renderUsage = (usage: UsageInfo): HTMLElement =>
        el(doc, 'div', 'cui-usage', usageText(usage) || 'usage');

    const renderSuggestions = (part: Extract<MessagePart, { type: 'suggestions' }>, message: ChatMessage): HTMLElement => {
        const row = el(doc, 'div', 'cui-suggestions');
        for (const prompt of part.prompts) {
            const chip = el(doc, 'button', 'cui-suggestion', prompt) as HTMLButtonElement;
            chip.type = 'button';
            chip.addEventListener('click', () => {
                if (interactive()) {
                    reportAction(message, 'suggestion', { text: prompt });
                } else {
                    input.value = prompt;
                    autosize();
                    input.focus();
                }
            });
            row.appendChild(chip);
        }
        return row;
    };

    const renderTaskPlan = (data: Partial<TaskPlanCardData> | undefined): HTMLElement => {
        const card = el(doc, 'div', 'cui-card');
        card.dataset.kind = 'task_plan';
        if (data?.title) card.appendChild(el(doc, 'div', 'cui-card-title', data.title));
        const list = el(doc, 'ol', 'cui-task-list');
        for (const step of data?.steps ?? []) {
            const item = el(doc, 'li', 'cui-task-step');
            item.dataset.status = step.status ?? 'pending';
            const glyphs = { pending: '○', active: '▸', done: '✓', error: '✕' } as const;
            item.appendChild(el(doc, 'span', 'cui-task-icon', glyphs[item.dataset.status as keyof typeof glyphs] ?? '○'));
            const labelWrap = el(doc, 'span', 'cui-task-label', step.label);
            item.appendChild(labelWrap);
            if (step.detail) item.appendChild(el(doc, 'span', 'cui-task-detail', step.detail));
            list.appendChild(item);
        }
        card.appendChild(list);
        return card;
    };

    const renderQuestion = (data: Partial<QuestionCardData> | undefined, message: ChatMessage): HTMLElement => {
        const card = el(doc, 'div', 'cui-card');
        card.dataset.kind = 'question';
        card.appendChild(el(doc, 'div', 'cui-card-title', data?.question ?? ''));
        const action = data?.action ?? 'question';
        const answered = data?.answer !== undefined;
        const canAnswer = interactive() && !answered;

        const markAnswered = (answer: string): void => {
            card.dataset.answered = 'true';
            card.querySelectorAll('button, input, select').forEach((c) => ((c as HTMLButtonElement).disabled = true));
            card.appendChild(el(doc, 'div', 'cui-card-answer', answer));
            reportAction(message, action, { answer });
        };

        if (answered) {
            card.dataset.answered = 'true';
            card.appendChild(el(doc, 'div', 'cui-card-answer', data!.answer));
        }
        if (data?.options?.length && !answered) {
            const opts = el(doc, 'div', 'cui-card-options');
            for (const opt of data.options) {
                const chip = el(doc, 'button', 'cui-suggestion', opt) as HTMLButtonElement;
                chip.type = 'button';
                chip.disabled = !canAnswer;
                chip.addEventListener('click', () => markAnswered(opt));
                opts.appendChild(chip);
            }
            card.appendChild(opts);
        }
        const showFreeText = !answered && (data?.allowFreeText ?? !data?.options?.length);
        if (showFreeText) {
            const row = el(doc, 'div', 'cui-card-answer-row');
            const field = doc.createElement('input');
            field.type = 'text';
            field.className = 'cui-card-input';
            field.placeholder = data?.placeholder ?? 'Type an answer…';
            field.disabled = !canAnswer;
            const btn = el(doc, 'button', '', data?.submitLabel ?? 'Send') as HTMLButtonElement;
            btn.type = 'button';
            btn.disabled = !canAnswer;
            const submitAnswer = (): void => {
                const answer = field.value.trim();
                if (answer) markAnswered(answer);
            };
            btn.addEventListener('click', submitAnswer);
            field.addEventListener('keydown', (ev) => {
                const inComposition = composing || ev.isComposing || ev.keyCode === 229;
                if (ev.key === 'Enter' && !inComposition) submitAnswer();
            });
            row.append(field, btn);
            card.appendChild(row);
        }
        return card;
    };

    const renderApproval = (data: Partial<ApprovalCardData> | undefined, message: ChatMessage): HTMLElement => {
        const card = el(doc, 'div', 'cui-card');
        card.dataset.kind = 'approval';
        const action = data?.action ?? 'approval';
        const state = data?.state ?? 'pending';
        card.dataset.state = state;
        if (data?.title) card.appendChild(el(doc, 'div', 'cui-card-title', data.title));
        if (data?.description) card.appendChild(el(doc, 'div', 'cui-card-desc', data.description));
        if (state === 'pending') {
            const row = el(doc, 'div', 'cui-card-actions');
            const canAct = interactive();
            const decide = (decision: 'approved' | 'rejected'): void => {
                card.dataset.state = decision;
                row.replaceChildren(el(doc, 'span', 'cui-card-state', decision === 'approved' ? 'Approved' : 'Rejected'));
                reportAction(message, action, { decision });
            };
            const yes = el(doc, 'button', 'cui-approve', data?.approveLabel ?? 'Approve') as HTMLButtonElement;
            yes.type = 'button';
            yes.disabled = !canAct;
            yes.addEventListener('click', () => decide('approved'));
            const no = el(doc, 'button', 'cui-reject', data?.rejectLabel ?? 'Reject') as HTMLButtonElement;
            no.type = 'button';
            no.disabled = !canAct;
            no.addEventListener('click', () => decide('rejected'));
            row.append(yes, no);
            card.appendChild(row);
        } else {
            card.appendChild(el(doc, 'div', 'cui-card-state', state === 'approved' ? 'Approved' : 'Rejected'));
        }
        return card;
    };

    const normalizeModel = (m: string | ChatModelOption): ChatModelOption =>
        typeof m === 'string' ? { id: m } : m;

    const renderModelSelect = (data: Partial<ModelSelectCardData> | undefined, message: ChatMessage): HTMLElement => {
        const card = el(doc, 'div', 'cui-card');
        card.dataset.kind = 'model_select';
        const action = data?.action ?? 'model_select';
        const row = el(doc, 'div', 'cui-card-modelrow');
        if (data?.label) row.appendChild(el(doc, 'span', 'cui-card-label', data.label));
        const select = doc.createElement('select');
        select.className = 'cui-model';
        for (const raw of data?.options ?? []) {
            const m = normalizeModel(raw);
            const opt = doc.createElement('option');
            opt.value = m.id;
            opt.textContent = m.hint ? `${m.label ?? m.id} — ${m.hint}` : (m.label ?? m.id);
            select.appendChild(opt);
        }
        if (data?.selected !== undefined) select.value = data.selected;
        select.disabled = !interactive();
        select.addEventListener('change', () => reportAction(message, action, { model: select.value }));
        row.appendChild(select);
        card.appendChild(row);
        return card;
    };

    /**
     * `references` part — a collapsed "Sources (n)" footer listing where
     * the answer's data came from. Every field is optional; entries that
     * are not objects are skipped and the rest render by position. `url`
     * becomes a link only when {@link isSafeUrl} accepts it — unsafe
     * schemes degrade to plain text. All fields are assigned through
     * textContent/attributes — never innerHTML.
     */
    const renderReferences = (part: Extract<MessagePart, { type: 'references' }>): HTMLElement | null => {
        const raw = part.items;
        const items = (Array.isArray(raw) ? raw : []).filter(
            (item): item is ReferenceItem => typeof item === 'object' && item !== null,
        );
        if (items.length === 0) return null;

        const details = el(doc, 'details', 'cui-references');
        details.appendChild(el(doc, 'summary', 'cui-references-summary', `Sources (${items.length})`));
        const list = el(doc, 'ol', 'cui-references-list');
        items.forEach((item, index) => {
            const li = el(doc, 'li', 'cui-reference');
            const id = item.id;
            const key = id !== undefined && id !== null && `${id}` !== '' ? `${id}` : String(index + 1);
            li.appendChild(el(doc, 'span', 'cui-ref-key', `[${key}]`));

            const body = el(doc, 'span', 'cui-ref-body');
            const title = typeof item.title === 'string' ? item.title : undefined;
            const url = typeof item.url === 'string' ? item.url : undefined;
            if (title !== undefined || url !== undefined) {
                const label = title ?? url ?? '';
                if (url !== undefined && isSafeUrl(url)) {
                    const link = doc.createElement('a');
                    link.className = 'cui-ref-title';
                    link.href = url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = label;
                    body.appendChild(link);
                } else {
                    body.appendChild(el(doc, 'span', 'cui-ref-title', label));
                }
            }

            const meta = el(doc, 'span', 'cui-ref-meta');
            if (typeof item.source === 'string' && item.source !== '') {
                meta.appendChild(el(doc, 'span', 'cui-ref-source', item.source));
            }
            if (item.verified === true) {
                meta.appendChild(el(doc, 'span', 'cui-ref-verified', '✓ verified'));
            }
            if (typeof item.publishedAt === 'string' && item.publishedAt !== '') {
                const time = doc.createElement('time');
                time.className = 'cui-ref-date';
                time.dateTime = item.publishedAt;
                time.textContent = item.publishedAt;
                meta.appendChild(time);
            }
            if (meta.childElementCount > 0) body.appendChild(meta);

            if (typeof item.snippet === 'string' && item.snippet !== '') {
                body.appendChild(el(doc, 'span', 'cui-ref-snippet', item.snippet));
            }
            li.appendChild(body);
            list.appendChild(li);
        });
        details.appendChild(list);
        return details;
    };

    /**
     * `subagent_run` card — a background-agent run as a first-class card:
     * status badge (color-coded by lifecycle), name/id, elapsed figure,
     * task/detail/progress lines, a usage chip, a collapsible output
     * excerpt and a cancel button for active runs.
     *
     * The view never runs timers: the elapsed figure is `elapsedMs`, or
     * `startedAt`→`finishedAt` (→ now while still active) computed once
     * at render. Hosts refresh live cards via `updateInteraction`/
     * `updateMessage` patches. Unknown status strings get a neutral
     * badge — the card never throws on host-defined states. All text is
     * assigned through textContent/attributes — never innerHTML.
     */
    const SUBAGENT_ACTIVE = new Set(['pending', 'running', 'waiting']);
    const subagentTone = (status: string): string => {
        if (status === 'running') return 'accent'; // pulsing badge
        if (status === 'done') return 'ok';
        if (status === 'failed' || status === 'timeout') return 'err';
        if (status === 'cancelled') return 'muted';
        if (status.startsWith('waiting')) return 'warn'; // 'waiting', 'waiting_input', …
        return 'neutral'; // 'pending', 'unknown', host-defined states
    };

    const renderSubagentRun = (data: Partial<SubagentRunData> | undefined, message: ChatMessage): HTMLElement => {
        const card = el(doc, 'div', 'cui-card cui-subagent');
        card.dataset.kind = 'subagent_run';
        const status = typeof data?.status === 'string' && data.status !== '' ? data.status : 'unknown';
        card.dataset.status = status;
        const id = typeof data?.id === 'string' ? data.id : '';
        const name = typeof data?.name === 'string' && data.name !== '' ? data.name : undefined;

        /* Header: badge + name (+ muted id) + elapsed + cancel. */
        const head = el(doc, 'div', 'cui-subagent-head');
        const badge = el(doc, 'span', 'cui-subagent-badge', status.replace(/_/g, ' '));
        badge.dataset.tone = subagentTone(status);
        head.appendChild(badge);
        head.appendChild(el(doc, 'span', 'cui-subagent-name', name ?? (id !== '' ? id : 'subagent run')));
        if (name !== undefined && id !== '' && name !== id) {
            head.appendChild(el(doc, 'span', 'cui-subagent-id', id));
        }
        const elapsedMs =
            typeof data?.elapsedMs === 'number' && Number.isFinite(data.elapsedMs)
                ? data.elapsedMs
                : (() => {
                      const start = typeof data?.startedAt === 'string' ? Date.parse(data.startedAt) : NaN;
                      if (Number.isNaN(start)) return undefined;
                      const end = typeof data?.finishedAt === 'string' ? Date.parse(data.finishedAt) : NaN;
                      return Number.isNaN(end)
                          ? SUBAGENT_ACTIVE.has(status)
                              ? Date.now() - start
                              : undefined
                          : end - start;
                  })();
        if (elapsedMs !== undefined) {
            head.appendChild(el(doc, 'span', 'cui-subagent-elapsed', formatElapsed(elapsedMs)));
        }
        if (data?.cancellable === true && SUBAGENT_ACTIVE.has(status) && interactive() && id !== '') {
            const stop = el(doc, 'button', 'cui-subagent-cancel', 'Cancel') as HTMLButtonElement;
            stop.type = 'button';
            stop.addEventListener('click', () => {
                stop.disabled = true;
                reportAction(message, data?.action ?? 'subagent_cancel', { id, status });
            });
            head.appendChild(stop);
        }
        card.appendChild(head);

        if (typeof data?.task === 'string' && data.task !== '') {
            card.appendChild(el(doc, 'div', 'cui-subagent-task', data.task));
        }
        if (typeof data?.detail === 'string' && data.detail !== '') {
            card.appendChild(el(doc, 'div', 'cui-subagent-detail', data.detail));
        }
        const progress = data?.progress;
        if (typeof progress === 'string' && progress !== '') {
            card.appendChild(el(doc, 'div', 'cui-subagent-detail', progress));
        } else if (
            typeof progress === 'object' &&
            progress !== null &&
            typeof progress.done === 'number' &&
            typeof progress.total === 'number'
        ) {
            const row = el(doc, 'div', 'cui-subagent-progressrow');
            const meter = el(doc, 'div', 'cui-subagent-progress');
            const fill = el(doc, 'i') as HTMLElement;
            const pct = progress.total > 0 ? Math.max(0, Math.min(100, (progress.done / progress.total) * 100)) : 0;
            fill.style.width = `${pct}%`;
            meter.appendChild(fill);
            row.append(meter, el(doc, 'span', 'cui-subagent-progress-label', `${progress.done}/${progress.total}`));
            card.appendChild(row);
        }
        if (data?.usage && typeof data.usage === 'object') {
            card.appendChild(renderUsage(data.usage));
        }
        if (typeof data?.output === 'string' && data.output !== '') {
            const details = el(doc, 'details', 'cui-subagent-output');
            details.appendChild(el(doc, 'summary', 'cui-subagent-output-summary', 'Output'));
            details.appendChild(el(doc, 'pre', 'cui-subagent-output-pre', data.output));
            card.appendChild(details);
        }
        return card;
    };

    const renderCard = (part: Extract<MessagePart, { type: 'card' }>, message: ChatMessage): HTMLElement | null => {
        const custom = customRenderers[`card:${part.kind}`];
        if (custom) return custom(part, { message, ownerDocument: doc });
        switch (part.kind) {
            case 'task_plan':
                return renderTaskPlan(part.data as Partial<TaskPlanCardData> | undefined);
            case 'question':
                return renderQuestion(part.data as Partial<QuestionCardData> | undefined, message);
            case 'approval':
                return renderApproval(part.data as Partial<ApprovalCardData> | undefined, message);
            case 'model_select':
                return renderModelSelect(part.data as Partial<ModelSelectCardData> | undefined, message);
            case 'subagent_run':
                return renderSubagentRun(part.data as Partial<SubagentRunData> | undefined, message);
            default:
                return customRenderers['card']?.(part, { message, ownerDocument: doc }) ?? null;
        }
    };

    const renderPart = (part: MessagePart, message: ChatMessage): HTMLElement | null => {
        if (part.type === 'card') return renderCard(part, message);
        const custom = customRenderers[part.type];
        if (custom) return custom(part, { message, ownerDocument: doc });

        switch (part.type) {
            case 'text':
                return el(doc, 'div', 'cui-part-text', part.text);
            case 'markdown': {
                const node = el(doc, 'div', 'cui-part-markdown');
                node.innerHTML = mdRender(part.text);
                return node;
            }
            case 'html': {
                const node = el(doc, 'div', 'cui-part-html');
                node.innerHTML = part.html; // host-trusted markup
                return node;
            }
            case 'image': {
                const src = safeEmbedUrl(part.src);
                if (!src) return null;
                const wrap = el(doc, 'div', 'cui-part-image');
                const img = doc.createElement('img');
                img.src = src;
                img.alt = part.alt ?? part.name ?? '';
                img.loading = 'lazy';
                wrap.appendChild(img);
                return wrap;
            }
            case 'audio': {
                const src = safeEmbedUrl(part.src);
                if (!src) return null;
                const wrap = el(doc, 'div', 'cui-part-media');
                const audio = doc.createElement('audio');
                audio.controls = true;
                audio.preload = 'metadata';
                audio.src = src;
                wrap.appendChild(audio);
                if (part.name) wrap.appendChild(el(doc, 'div', 'cui-media-name', part.name));
                return wrap;
            }
            case 'video': {
                const src = safeEmbedUrl(part.src);
                if (!src) return null;
                const wrap = el(doc, 'div', 'cui-part-media');
                const video = doc.createElement('video');
                video.controls = true;
                video.preload = 'metadata';
                video.src = src;
                if (part.poster) {
                    const poster = safeEmbedUrl(part.poster);
                    if (poster) video.poster = poster;
                }
                wrap.appendChild(video);
                if (part.name) wrap.appendChild(el(doc, 'div', 'cui-media-name', part.name));
                return wrap;
            }
            case 'quote': {
                const node = el(doc, 'blockquote', 'cui-part-quote');
                node.appendChild(el(doc, 'div', 'cui-quote-body', part.text));
                if (part.source) node.appendChild(el(doc, 'cite', 'cui-quote-source', part.source));
                return node;
            }
            case 'suggestions':
                return renderSuggestions(part, message);
            case 'usage':
                return renderUsage(part.usage);
            case 'evidence': {
                const node = el(doc, 'div', 'cui-evidence');
                const level: EvidenceLevel = part.level ?? 'info';
                node.dataset.level = level;
                const icons: Record<EvidenceLevel, string> = { info: 'ℹ', warning: '⚠', error: '✕' };
                node.appendChild(el(doc, 'span', 'cui-evidence-icon', icons[level]));
                const body = el(doc, 'span', 'cui-evidence-body');
                body.appendChild(el(doc, 'span', 'cui-evidence-text', part.text));
                if (part.detail) body.appendChild(el(doc, 'span', 'cui-evidence-detail', part.detail));
                node.appendChild(body);
                return node;
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
            case 'references':
                return renderReferences(part);
            case 'divider':
                return el(doc, 'hr');
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

    const renderCostChip = (message: ChatMessage): HTMLElement | null => {
        if (!features.costChip) return null;
        const usage = message.meta?.['usage'] as UsageInfo | undefined;
        if (!usage || typeof usage !== 'object') return null;
        // no duplicate chip when the host already emitted a usage part
        if (message.parts.some((p) => p.type === 'usage')) return null;
        return renderUsage(usage);
    };

    const addMessage: ChatViewHandle['addMessage'] = (message) => {
        const key = partKey(message);
        const existing = byKey.get(key);
        if (existing) existing.node.remove();
        streams.delete(key);

        const node = el(doc, 'div', 'cui-msg');
        node.dataset.role = message.role;
        if (message.status) node.dataset.status = message.status;
        const body = el(doc, 'div', 'cui-bubble');
        const partEls: (HTMLElement | null)[] = [];
        for (const part of message.parts) {
            const rendered = renderPart(part, message);
            partEls.push(rendered);
            if (rendered) body.appendChild(rendered);
        }
        const chip = renderCostChip(message);
        if (chip) body.appendChild(chip);
        const actions = renderActions(message);
        if (actions) body.appendChild(actions);
        node.appendChild(body);
        messages.appendChild(node);
        byKey.set(key, { message, node, body, partEls });
        applyScroll(message.role === 'user');
    };

    const renderQueue = (items: readonly QueuedMessage[]) => {
        queuePanel.replaceChildren();
        queuePanel.classList.toggle('visible', items.length > 0);
        for (const item of items) {
            const row = el(doc, 'div', 'cui-queue-item');
            const text = el(doc, 'span', 'cui-queue-text', item.text);
            row.appendChild(text);
            // Optional attribution suffix — e.g. which agent queued the item.
            const meta = item.meta as Readonly<Record<string, unknown>> | undefined;
            const byline = typeof meta?.['agent'] === 'string' ? meta['agent'] : meta?.['author'];
            if (typeof byline === 'string' && byline !== '') {
                row.appendChild(el(doc, 'span', 'cui-queue-meta', `· ${byline}`));
            }

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
        if (!text && staged.length === 0) return;
        const submission: ChatSubmit = staged.length ? { text, attachments: [...staged] } : { text };
        input.value = '';
        if (fileInput) fileInput.value = '';
        clearStaged();
        autosize();
        void transport.send(submission);
    };

    send.addEventListener('click', () => {
        submit();
        applyScroll(true);
    });
    cancel.addEventListener('click', () => transport.cancel?.());
    attach.addEventListener('click', () => {
        if (transport.requestAttachments) void transport.requestAttachments();
        else fileInput?.click();
    });
    quoteDismiss.addEventListener('click', () => handle.clearQuote());

    /* ---------------------------------------------------------------- */
    /* IME composition — ported from Deep Chat's TextInput approach:      */
    /* compositionstart/end guard so Enter confirms IME candidates        */
    /* instead of submitting. `isComposing`/keyCode 229 cover engines     */
    /* that fire keydown before compositionend (Safari).                  */
    /* ---------------------------------------------------------------- */

    let composing = false;
    input.addEventListener('compositionstart', () => (composing = true));
    input.addEventListener('compositionend', () => (composing = false));
    input.addEventListener('keydown', (ev) => {
        const inComposition = composing || ev.isComposing || ev.keyCode === 229;
        if (ev.key === 'Enter' && !ev.shiftKey) {
            if (!inComposition) {
                ev.preventDefault();
                submit();
            }
        } else if (ev.key === 'Escape' && !inComposition && stagedQuote != null) {
            handle.clearQuote();
        }
    });
    input.addEventListener('input', autosize);

    const streamOpts = () =>
        options.renderMarkdown ? { render: options.renderMarkdown } : undefined;

    const lastStreamablePart = (parts: readonly MessagePart[]): number => {
        for (let i = parts.length - 1; i >= 0; i--) {
            const t = parts[i]?.type;
            if (t === 'text' || t === 'markdown') return i;
        }
        return -1;
    };

    const handle: ChatViewHandle = {
        addMessage,
        updateMessage(domKey, patch) {
            const entry = byKey.get(domKey);
            if (!entry) return;
            const merged: ChatMessage = { ...entry.message, ...patch };
            addMessage(merged);
        },
        addInteraction(interaction) {
            addMessage(interactionToMessage(interaction));
        },
        updateInteraction(domKey, patch) {
            const entry = byKey.get(domKey);
            if (!entry) return;
            const merged: ChatMessage = { ...entry.message, ...interactionPatchToMessage(patch) };
            addMessage(merged);
        },
        appendDelta(domKey, delta) {
            const entry = byKey.get(domKey);
            if (!entry || !delta) return;
            const parts = [...entry.message.parts];
            const partEls = [...entry.partEls];
            let idx = lastStreamablePart(parts);

            if (idx === -1) {
                const fmt = options.deltaFormat ?? 'text';
                const part: MessagePart =
                    fmt === 'markdown'
                        ? { type: 'markdown', text: delta }
                        : { type: 'text', text: delta };
                parts.push(part);
                const rendered = renderPart(part, entry.message);
                partEls.push(rendered);
                if (rendered) {
                    entry.body.appendChild(rendered);
                    if (part.type === 'markdown') {
                        rendered.replaceChildren();
                        const renderer = new MarkdownStreamRenderer(rendered, streamOpts());
                        renderer.append(delta);
                        streams.set(domKey, { renderer, el: rendered });
                    }
                }
            } else {
                const part = parts[idx]!;
                const text = (part.type === 'text' || part.type === 'markdown' ? part.text : '') + delta;
                parts[idx] = { ...part, text } as MessagePart;
                const target = partEls[idx];
                if (part.type === 'markdown' && target) {
                    let st = streams.get(domKey);
                    if (!st || st.el !== target) {
                        target.replaceChildren();
                        const renderer = new MarkdownStreamRenderer(target, streamOpts());
                        renderer.append(text.slice(0, text.length - delta.length));
                        st = { renderer, el: target };
                        streams.set(domKey, st);
                    }
                    st.renderer.append(delta);
                } else if (part.type === 'text' && target) {
                    target.textContent = text;
                }
            }
            byKey.set(domKey, { ...entry, message: { ...entry.message, parts }, partEls });
            applyScroll();
        },
        removeMessage(domKey) {
            const entry = byKey.get(domKey);
            if (entry) {
                entry.node.remove();
                byKey.delete(domKey);
                streams.delete(domKey);
            }
        },
        clearMessages() {
            byKey.clear();
            streams.clear();
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
        setModels(models, selected) {
            if (!features.modelPicker) return;
            setModels(models, selected);
        },
        getSelectedModel() {
            return modelSelect.hidden ? null : modelSelect.value;
        },
        stageAttachments(items) {
            stageItems(items);
        },
        getAttachments: () => [...staged],
        clearAttachments() {
            clearStaged();
        },
        scrollToBottom(force) {
            applyScroll(force !== false);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            byKey.clear();
            streams.clear();
            revokePreviews();
            root.remove();
        },
    };

    return handle;
}
