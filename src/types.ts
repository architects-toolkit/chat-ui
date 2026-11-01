/*
 * chat-ui — public contract types.
 *
 * The view is deliberately host-agnostic: it renders ChatMessage values
 * supplied by the host and reports user intent through ChatTransport.
 * Nothing in this file knows where messages come from (HTTP, SSE, a
 * native-webview bridge, a worker) — that is the transport's business.
 */

import type { CanonicalInteraction } from './interactions.js';

/** Who authored a message. `tool` is a first-class role for call/result parts. */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

/**
 * Logical kind of an attachment. `'file'` is the generic bucket; media
 * kinds let transports and renderers treat payloads appropriately.
 * Open string union — hosts may declare their own kinds.
 */
export type AttachmentKind = 'file' | 'image' | 'audio' | 'video' | (string & {});

/**
 * A typed attachment reference. Wraps an optional `File` when the item was
 * picked locally, or describes remote/recorded media by `url` — e.g. a
 * speech-to-text recording staged by the host.
 */
export interface ChatAttachment {
    readonly kind: AttachmentKind;
    readonly name: string;
    readonly mimeType?: string;
    readonly size?: number;
    /** Preview/fetch URL — `blob:`, `data:`, `http(s):` are rendered. */
    readonly url?: string;
    /** The original `File` when the attachment was picked in the composer. */
    readonly file?: File;
    /** Free-form host data (upload id, duration, waveform, …). */
    readonly meta?: Readonly<Record<string, unknown>>;
}

/** What the composer can hold: a picked `File` or a typed attachment ref. */
export type SubmitAttachment = File | ChatAttachment;

/* ------------------------------------------------------------------ */
/* Message parts                                                       */
/* ------------------------------------------------------------------ */

/** Per-turn cost/usage figure shown as a compact chip. */
export interface UsageInfo {
    /** Optional label prefix, e.g. a model or turn name. */
    readonly label?: string;
    readonly tokensIn?: number;
    readonly tokensOut?: number;
    /** Monetary cost for the turn, in `currency` units. */
    readonly cost?: number;
    /** ISO-ish currency hint rendered next to `cost` (default `$`). */
    readonly currency?: string;
    readonly durationMs?: number;
}

/** Severity for `evidence` lines — drives color only. */
export type EvidenceLevel = 'info' | 'warning' | 'error';

/* ---- Card kinds -------------------------------------------------- */
/*
 * A small set of generic, well-typed card kinds covers the common agent
 * surfaces. Hosts with bespoke needs register a `card:<kind>` part
 * renderer instead of requesting new kinds.
 */

/** Built-in card kinds rendered natively by the view. */
export type BuiltinCardKind = 'task_plan' | 'question' | 'approval' | 'model_select' | 'subagent_run';

/** `kind` of a `card` part — built-ins plus host-defined strings. */
export type CardKind = BuiltinCardKind | (string & {});

/** One step inside a `task_plan` card. */
export interface TaskPlanStep {
    readonly label: string;
    readonly status?: 'pending' | 'active' | 'done' | 'error';
    readonly detail?: string;
}

/** `card` data for `kind: 'task_plan'` — an ordered plan/todo list. */
export interface TaskPlanCardData {
    readonly title?: string;
    readonly steps: readonly TaskPlanStep[];
}

/**
 * `card` data for `kind: 'question'` — asks the user something inline.
 * Rendered with optional quick-pick options and/or a free-text input.
 * Submission reports `{ answer }` through `transport.messageAction`.
 */
export interface QuestionCardData {
    readonly question: string;
    /** Quick-pick answers rendered as chips (single select). */
    readonly options?: readonly string[];
    /** Show a free-text input (default true when `options` absent). */
    readonly allowFreeText?: boolean;
    readonly placeholder?: string;
    readonly submitLabel?: string;
    /** Action id reported to `messageAction` (default `'question'`). */
    readonly action?: string;
    /** When set, the card renders in its answered state. */
    readonly answer?: string;
}

/**
 * `card` data for `kind: 'approval'` — a consent/confirmation prompt.
 * Decisions report `{ decision: 'approved' | 'rejected' }` through
 * `transport.messageAction`.
 */
export interface ApprovalCardData {
    readonly title?: string;
    readonly description?: string;
    readonly approveLabel?: string;
    readonly rejectLabel?: string;
    /** Action id reported to `messageAction` (default `'approval'`). */
    readonly action?: string;
    readonly state?: 'pending' | 'approved' | 'rejected';
}

/** A selectable model entry (`model_select` card + composer picker). */
export interface ChatModelOption {
    readonly id: string;
    readonly label?: string;
    /** Secondary text rendered after the label (e.g. price, capability). */
    readonly hint?: string;
}

/**
 * `card` data for `kind: 'model_select'` — an inline model `<select>`.
 * Selection reports `{ model }` through `transport.messageAction`.
 */
export interface ModelSelectCardData {
    readonly label?: string;
    readonly options: readonly (string | ChatModelOption)[];
    readonly selected?: string;
    /** Action id reported to `messageAction` (default `'model_select'`). */
    readonly action?: string;
}

/** Step progress inside a `subagent_run` card — `{ done, total }` or a free-form label. */
export interface SubagentRunProgress {
    readonly done: number;
    readonly total: number;
}

/**
 * `card` data for `kind: 'subagent_run'` — a background-agent run shown
 * as a first-class card: status badge, name/id, elapsed time, optional
 * task/detail/progress lines, a usage chip, a collapsible output
 * excerpt and (while the run is still active) a cancel button.
 *
 * The view never runs timers: `elapsedMs` is preferred, otherwise the
 * figure is derived once at render from `startedAt`→`finishedAt` (or
 * `startedAt`→now while still active). Hosts refresh live cards by
 * pushing `updateInteraction`/`updateMessage` patches.
 *
 * Cancelling reports `{ id, status }` through `transport.messageAction`
 * under `action` (default `'subagent_cancel'`); the button only renders
 * for the active states `pending`/`running`/`waiting` when
 * `cancellable` is set and `features.messageActions` +
 * `transport.messageAction` are wired.
 */
export interface SubagentRunData {
    /** Run/agent id — echoed back in the cancel payload. */
    readonly id: string;
    /** Display label (falls back to `id`). */
    readonly name?: string;
    /** Goal/summary line. */
    readonly task?: string;
    /**
     * Run lifecycle: `pending` | `running` | `waiting` | `done` |
     * `failed` | `cancelled` | `timeout` — or any host-defined string,
     * which renders a neutral badge (statuses starting with `waiting`
     * share the waiting tone).
     */
    readonly status:
        | 'pending'
        | 'running'
        | 'waiting'
        | 'done'
        | 'failed'
        | 'cancelled'
        | 'timeout'
        | (string & {});
    /** Extra muted line (current step, exit reason, …). */
    readonly detail?: string;
    /** ISO start time — with `finishedAt`, derives the elapsed figure. */
    readonly startedAt?: string;
    /** ISO finish time. */
    readonly finishedAt?: string;
    /** Working-time figure in ms; preferred over `startedAt`→`finishedAt`. */
    readonly elapsedMs?: number;
    /** Step progress — `{ done, total }` renders a meter, a string renders as-is. */
    readonly progress?: SubagentRunProgress | string;
    /** Cost/usage metrics — rendered with the shared usage-chip format. */
    readonly usage?: UsageInfo;
    /** Result/excerpt — collapsible `<details>`, line-clamped preview. */
    readonly output?: string;
    /** Show a cancel button while the run is in an active state. */
    readonly cancellable?: boolean;
    /** Action id reported to `messageAction` (default `'subagent_cancel'`). */
    readonly action?: string;
}

/**
 * One cited source inside a `references` part — where an answer's data
 * came from (a web hit, a document, a tool output). Rendered as a
 * numbered `[id]` entry in a collapsed "Sources" footer; `url` is
 * emitted as a link only when it passes the shared URL sanitizer —
 * unsafe schemes degrade to unlinked text.
 */
export interface ReferenceItem {
    /** Display key rendered as `[id]`; defaults to the 1-based position. */
    readonly id?: string | number;
    /** Human-readable source title (the linked/unlinked label). */
    readonly title?: string;
    /** Link target — `javascript:`/`vbscript:`/`file:`/`data:` render unlinked. */
    readonly url?: string;
    /** Short excerpt, line-clamped by the stylesheet. */
    readonly snippet?: string;
    /** Origin label, e.g. the tool that produced it (`'web_search'`). */
    readonly source?: string;
    /** Renders a "verified" badge when true. */
    readonly verified?: boolean;
    /** ISO date string, shown muted. */
    readonly publishedAt?: string;
}

/** Union of the built-in card payloads. */
export type CardData =
    | TaskPlanCardData
    | QuestionCardData
    | ApprovalCardData
    | ModelSelectCardData
    | SubagentRunData;

/**
 * A `card` part: the built-in kinds above are rendered natively; any
 * other `kind` resolves through `partRenderers['card:<kind>']` then
 * `partRenderers['card']`.
 */
export type CardPart =
    | { readonly type: 'card'; readonly kind: 'task_plan'; readonly data: TaskPlanCardData }
    | { readonly type: 'card'; readonly kind: 'question'; readonly data: QuestionCardData }
    | { readonly type: 'card'; readonly kind: 'approval'; readonly data: ApprovalCardData }
    | { readonly type: 'card'; readonly kind: 'model_select'; readonly data: ModelSelectCardData }
    | { readonly type: 'card'; readonly kind: 'subagent_run'; readonly data: SubagentRunData }
    | { readonly type: 'card'; readonly kind: CardKind; readonly data?: unknown };

/**
 * A renderable fragment of a message. The built-in renderers cover the
 * common parts; hosts register custom renderers per `type` (or per
 * `card:<kind>`) to draw application-specific parts.
 */
export type MessagePart =
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'markdown'; readonly text: string }
    | { readonly type: 'html'; readonly html: string }
    | { readonly type: 'image'; readonly src: string; readonly alt?: string; readonly name?: string }
    | { readonly type: 'audio'; readonly src: string; readonly name?: string; readonly mimeType?: string }
    | { readonly type: 'video'; readonly src: string; readonly name?: string; readonly mimeType?: string; readonly poster?: string }
    | { readonly type: 'quote'; readonly text: string; readonly source?: string }
    | { readonly type: 'suggestions'; readonly prompts: readonly string[] }
    | { readonly type: 'usage'; readonly usage: UsageInfo }
    | { readonly type: 'evidence'; readonly text: string; readonly detail?: string; readonly level?: EvidenceLevel }
    | { readonly type: 'tool_call'; readonly name: string; readonly args?: string; readonly status?: 'pending' | 'running' | 'done' | 'error' }
    | { readonly type: 'tool_result'; readonly name?: string; readonly content: string; readonly isError?: boolean }
    | { readonly type: 'references'; readonly items: readonly ReferenceItem[] }
    | CardPart
    | { readonly type: 'divider' };

/** Lifecycle of a message; drives pending/streaming visuals. */
export type ChatMessageStatus = 'queued' | 'streaming' | 'done' | 'error';

/** One conversation message. `domKey` lets hosts address it for updates. */
export interface ChatMessage {
    readonly id: string;
    readonly role: ChatRole;
    readonly parts: readonly MessagePart[];
    readonly status?: ChatMessageStatus;
    /** Optional stable key for incremental updates (add/edit/replace). */
    readonly domKey?: string;
    /**
     * Free-form host data (turn id, actions, usage, agent label, …).
     * `meta.actions` feeds the actions row (feature `messageActions`);
     * `meta.usage` feeds the cost chip (feature `costChip`).
     */
    readonly meta?: Readonly<Record<string, unknown>>;
}

/** A user message held in the outgoing queue instead of sent immediately. */
export interface QueuedMessage {
    readonly id: string;
    readonly text: string;
    readonly createdAt?: number;
    /**
     * Free-form host data (attribution, scheduling, …). When `meta.agent`
     * or `meta.author` is a string it renders as a small muted suffix —
     * e.g. which agent the queued item belongs to.
     */
    readonly meta?: Readonly<Record<string, unknown>>;
}

/** What the user typed/picked to send. */
export interface ChatSubmit {
    readonly text: string;
    /**
     * Picked files arrive as `File`; host-staged media (recordings,
     * remote refs) arrives as typed `ChatAttachment` values. Use the
     * exported `isChatAttachment` guard to discriminate.
     */
    readonly attachments?: readonly SubmitAttachment[];
}

/* ------------------------------------------------------------------ */
/* Transport + features                                                */
/* ------------------------------------------------------------------ */

/**
 * Host-implemented bridge between user intent and the conversation engine.
 * Optional members correspond to feature flags — the view only calls a
 * member when the matching feature is enabled.
 */
export interface ChatTransport {
    /** Send a composer submission. */
    send(input: ChatSubmit): void | Promise<void>;
    /** Abort the in-flight response. */
    cancel?(): void;
    /** Queue feature: replace a queued message's text. */
    editQueued?(id: string, text: string): void;
    /** Queue feature: deliver one queued message immediately, mid-turn. */
    sendQueuedNow?(id: string): void;
    /** Queue feature: drop a queued message. */
    removeQueued?(id: string): void;
    /**
     * `messageActions` feature: an interactive part was activated —
     * approve/reject buttons, question-card answers, model_select
     * changes, suggestion picks, actions rows. `action` names the
     * interaction; `payload` carries the value (e.g. `{ answer }`,
     * `{ decision }`, `{ model }`, `{ text }`).
     */
    messageAction?(messageId: string, action: string, payload?: unknown): void;
    /** `modelPicker` feature: the composer model selector changed. */
    selectModel?(modelId: string): void;
    /**
     * `attachments` feature: the 📎 button was clicked and the host picks
     * files itself (e.g. a native file dialog). When defined, the view
     * creates no built-in `<input type=file>`; the host supplies picks
     * out-of-band and stages them through `handle.stageAttachments(...)`.
     * Staged items flow through `send` exactly like composer-picked ones.
     */
    requestAttachments?(): void | Promise<void>;
}

/**
 * Input affordances the host supports. Reserved for capability
 * negotiation — e.g. `'audio'` tells the host speech input may be
 * staged as `ChatAttachment`s even though the view ships no mic.
 */
export type InputMode = 'text' | 'attachments' | 'audio' | (string & {});

/** Capability map — every UI region beyond list+composer is opt-in. */
export interface ChatFeatures {
    /** Show the outgoing-message queue panel (edit/send-now/remove). */
    readonly queue?: boolean;
    /** Show the context/effort card region fed by setContextUsage. */
    readonly contextCard?: boolean;
    /** Show a staged quote chip above the composer. */
    readonly quoteChip?: boolean;
    /** Enable the attachment button + staged-attachment preview strip. */
    readonly attachments?: boolean;
    /**
     * `accept` attribute for the attachment file picker
     * (e.g. `'image/*'`, `'audio/*,image/*'`).
     */
    readonly attachmentAccept?: string;
    /**
     * Declared input affordances. When present without `'attachments'`
     * the attachment button is hidden even if `attachments` is true.
     */
    readonly inputModes?: readonly InputMode[];
    /** Show a compact model `<select>` in the composer (feed via `setModels`). */
    readonly modelPicker?: boolean;
    /** Show a per-message cost/usage chip fed from `meta.usage`. */
    readonly costChip?: boolean;
    /** Enable interactive controls in parts (approval, question, model_select, suggestions, actions rows). */
    readonly messageActions?: boolean;
}

/** Options accepted by createChatView. */
export interface ChatViewOptions {
    readonly transport: ChatTransport;
    readonly features?: ChatFeatures;
    /** Placeholder text for the composer input. */
    readonly placeholder?: string;
    /**
     * When true, `DEFAULT_STYLES` is not injected — the host owns every
     * rule. `extraCss` is still injected: it is host-supplied CSS either
     * way, there is simply no default sheet before it.
     */
    readonly unstyled?: boolean;
    /**
     * Stamps `data-theme` on the root element. The built-in stylesheet
     * ships a `'dark'` palette; any other name is host-defined and
     * consumed by host CSS or `extraCss` (`[data-theme='brand']`
     * selectors targeting `.chat-ui` or its descendants).
     */
    readonly theme?: string;
    /**
     * Host CSS injected as a second `<style>` element after
     * `DEFAULT_STYLES` — the escape hatch that ships with the mount
     * options: `--cui-*` token overrides, `data-theme` variants, and
     * small rules live with the mount config. Injected even when
     * `unstyled` is set (it is host CSS either way). Every injected
     * sheet carries a `data-cui-styles` attribute (`'default'` |
     * `'extra'`) so tooling and tests can query them.
     */
    readonly extraCss?: string;
    /**
     * Markdown → HTML renderer used for `markdown` parts and the
     * streaming tail. Default: the bundled dependency-free renderer.
     */
    readonly renderMarkdown?: (markdown: string) => string;
    /**
     * Part type `appendDelta` creates when the target message has no
     * `text`/`markdown` part yet. Default `'text'`; use `'markdown'`
     * when the stream is known to be markdown.
     */
    readonly deltaFormat?: 'text' | 'markdown';
    /**
     * Custom renderers. Keyed by `part.type`; for `card` parts the more
     * specific `card:<kind>` key is consulted first, then `'card'`.
     */
    readonly partRenderers?: Readonly<Record<string, PartRenderer>>;
}

/** Renders one part into an element appended to the message body. */
export type PartRenderer = (part: MessagePart, ctx: PartRenderContext) => HTMLElement | null;

export interface PartRenderContext {
    readonly message: ChatMessage;
    readonly ownerDocument: Document;
}

/** Imperative surface the host drives — the rest of the UI is internal. */
export interface ChatViewHandle {
    /** Append a message (or replace when id/domKey already exists). */
    addMessage(message: ChatMessage): void;
    /** Patch an existing message in place. */
    updateMessage(domKey: string, message: Partial<ChatMessage>): void;
    /**
     * Canonical contract (v2): append a `CanonicalInteraction` — thin
     * delegate over `addMessage(interactionToMessage(i))`. Hosts can
     * program purely against the canonical vocabulary.
     */
    addInteraction(interaction: CanonicalInteraction): void;
    /**
     * Canonical contract (v2): patch an interaction in place by domKey —
     * thin delegate over `updateMessage` with the patch normalized
     * (`background` role → `system`, malformed fields dropped).
     */
    updateInteraction(domKey: string, patch: Partial<CanonicalInteraction>): void;
    /**
     * Streaming helper: append text to the last `text`/`markdown` part
     * (creates one of `options.deltaFormat` type when absent). Markdown
     * targets render incrementally — complete paragraphs freeze, the
     * unfinished tail re-renders — so partial `**`/` ``` `/link syntax
     * never produces broken markup.
     */
    appendDelta(domKey: string, delta: string): void;
    removeMessage(domKey: string): void;
    clearMessages(): void;
    /** Reflect outgoing-queue state (requires features.queue). */
    setQueue(items: readonly QueuedMessage[]): void;
    /**
     * Reflect processing state: swaps the send button for cancel and
     * marks the composer non-interactive. Composes with
     * `setComposerEnabled` — the composer accepts input only while
     * enabled AND not processing, so the two may be called in any order;
     * processing never re-enables a composer the host disabled.
     */
    setProcessing(processing: boolean): void;
    /** Set the status line (e.g. 'Thinking…', 'Error'). */
    setStatus(status: string): void;
    /** Feed the context card (requires features.contextCard). */
    setContextUsage(usage: { percent: number; elapsedMs?: number } | null): void;
    /** Stage a quote chip above the composer (requires quoteChip). */
    stageQuote(text: string): void;
    /** Currently staged quote text, or null. */
    getQuote(): string | null;
    clearQuote(): void;
    /**
     * Current composer input value — what the user typed or what
     * `setComposerText` prefilled.
     */
    getComposerText(): string;
    /**
     * Set the composer input value and re-autosize it — the prefill
     * hook for flows like edit-and-resend. `focus: true` also focuses
     * the textarea with the cursor at the end of the text.
     */
    setComposerText(text: string, opts?: { focus?: boolean }): void;
    /** Focus the composer input. */
    focusComposer(): void;
    /**
     * Enable or disable the composer: the textarea plus the send and
     * attach buttons. Composes with `setProcessing` — the composer is
     * interactive only while enabled AND not processing, so hosts may
     * call the two in any order.
     */
    setComposerEnabled(enabled: boolean): void;
    /** Update the composer input placeholder. */
    setPlaceholder(text: string): void;
    /**
     * Feed the composer model picker (requires features.modelPicker).
     * Pass an empty list to keep the picker hidden.
     */
    setModels(models: readonly ChatModelOption[], selected?: string): void;
    /** Id of the currently selected composer model, if any. */
    getSelectedModel(): string | null;
    /**
     * Stage attachments into the composer strip (requires
     * features.attachments). Accepts `File`s and `ChatAttachment`s.
     */
    stageAttachments(items: readonly SubmitAttachment[]): void;
    /** Attachments currently staged in the composer. */
    getAttachments(): readonly SubmitAttachment[];
    clearAttachments(): void;
    /**
     * Scroll the message list. With `force`, always jumps to the
     * bottom; otherwise scrolls only when the user is already pinned
     * to the bottom (scroll anchoring).
     */
    scrollToBottom(force?: boolean): void;
    destroy(): void;
}
