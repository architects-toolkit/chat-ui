/*
 * chat-ui — custom element adapter: <chat-ui-view>.
 *
 * A zero-friction mount for plain HTML hosts: drop the element on the page,
 * wire a transport object, and call the same ChatViewHandle API through
 * `element.handle` once connected (or `element.init(options)` when the
 * element is created dynamically).
 */

import { createChatView } from '../chat-view.js';
import type { ChatViewHandle, ChatViewOptions } from '../types.js';

/*
 * The IIFE bundle may be evaluated in a context without DOM globals
 * (injected before DOMContentLoaded, pre-bundled by a host, SSR'd) where a
 * bare `extends HTMLElement` would throw a ReferenceError at import time.
 * Fall back to a stub base — the class is only ever instantiated by
 * `customElements.define`, which is itself guarded in defineChatUIElement.
 */
const HTMLElementBase: typeof HTMLElement =
    (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement ??
    (class {} as unknown as typeof HTMLElement);

export class ChatUIViewElement extends HTMLElementBase {
    private view: ChatViewHandle | null = null;
    private pending: ChatViewOptions | null = null;

    /** The live view handle once `init` (or `options` + connect) ran. */
    get handle(): ChatViewHandle | null {
        return this.view;
    }

    /**
     * Initialize the view. Calling this is required before `handle` exists;
     * safe to call lazily once transport/features are known.
     */
    init(options: ChatViewOptions): ChatViewHandle {
        if (this.view) this.view.destroy();
        this.view = createChatView(this, options);
        return this.view;
    }

    disconnectedCallback(): void {
        this.view?.destroy();
        this.view = null;
    }
}

/**
 * Registers `<chat-ui-view>` — idempotent. No-ops in contexts without a
 * `customElements` registry (non-DOM evaluation of the vendored bundle).
 */
export function defineChatUIElement(tag = 'chat-ui-view'): void {
    const registry = (globalThis as { customElements?: CustomElementRegistry }).customElements;
    if (!registry || registry.get(tag)) return;
    registry.define(tag, ChatUIViewElement);
}
