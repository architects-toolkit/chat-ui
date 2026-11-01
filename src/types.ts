/*
 * chat-ui — public contract types.
 *
 * The view is deliberately host-agnostic: it renders ChatMessage values
 * supplied by the host and reports user intent through ChatTransport.
 * Nothing in this file knows where messages come from (HTTP, SSE, a
 * native-webview bridge, a worker) — that is the transport's business.
 */

/** Who authored a message. `tool` is a first-class role for call/result parts. */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * A renderable fragment of a message. The built-in renderers cover the
 * common parts; hosts register custom renderers per `type` to draw
 * application-specific parts (approval cards, citations, …).
 */
export type MessagePart =
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'markdown'; readonly text: string }
    | { readonly type: 'html'; readonly html: string }
    | { readonly type: 'image'; readonly src: string; readonly alt?: string }
    | { readonly type: 'tool_call'; readonly name: string; readonly args?: string; readonly status?: 'pending' | 'running' | 'done' | 'error' }
    | { readonly type: 'tool_result'; readonly name?: string; readonly content: string; readonly isError?: boolean }
    | { readonly type: 'card'; readonly kind: string; readonly data?: unknown }
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
    /** Free-form host data (turn id, tokens, cost, agent label, …). */
    readonly meta?: Readonly<Record<string, unknown>>;
}

/** A user message held in the outgoing queue instead of sent immediately. */
export interface QueuedMessage {
    readonly id: string;
    readonly text: string;
    readonly createdAt?: number;
}

/** What the user typed/picked to send. */
export interface ChatSubmit {
    readonly text: string;
    readonly attachments?: readonly File[];
}

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
    /** Action-parts feature: an in-message action button was activated
     *  (approve/reject, answer a question card, …). */
    messageAction?(messageId: string, action: string, payload?: unknown): void;
}

/** Capability map — every UI region beyond list+composer is opt-in. */
export interface ChatFeatures {
    /** Show the outgoing-message queue panel (edit/send-now/remove). */
    readonly queue?: boolean;
    /** Show the context/effort card region fed by setContextUsage. */
    readonly contextCard?: boolean;
    /** Show a staged quote chip above the composer. */
    readonly quoteChip?: boolean;
    /** Enable the attachment button; files flow through ChatSubmit. */
    readonly attachments?: boolean;
    /** Show a per-message cost/meta chip fed from message.meta. */
    readonly costChip?: boolean;
    /** Render action buttons inside `card` parts (approve/reject, …). */
    readonly messageActions?: boolean;
}

/** Options accepted by createChatView. */
export interface ChatViewOptions {
    readonly transport: ChatTransport;
    readonly features?: ChatFeatures;
    /** Placeholder text for the composer input. */
    readonly placeholder?: string;
    /** When true, no built-in stylesheet is injected (full host styling). */
    readonly unstyled?: boolean;
    /** Custom renderers for MessagePart.type values not handled natively. */
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
    /** Streaming helper: append text to a 'text' part of a message. */
    appendDelta(domKey: string, delta: string): void;
    removeMessage(domKey: string): void;
    clearMessages(): void;
    /** Reflect outgoing-queue state (requires features.queue). */
    setQueue(items: readonly QueuedMessage[]): void;
    /** Reflect processing state: disables send, shows cancel. */
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
    destroy(): void;
}
