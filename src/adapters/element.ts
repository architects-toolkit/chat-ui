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

export class ChatUIViewElement extends HTMLElement {
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

/** Registers `<chat-ui-view>` — idempotent. */
export function defineChatUIElement(tag = 'chat-ui-view'): void {
    if (!customElements.get(tag)) {
        customElements.define(tag, ChatUIViewElement);
    }
}
