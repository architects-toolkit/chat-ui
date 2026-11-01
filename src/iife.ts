/*
 * chat-ui — vendored single-file bundle entry.
 *
 * This entry only feeds the self-contained browser builds:
 * `dist/chat-ui.js` (ESM) uses `src/index.ts` directly; `dist/chat-ui.iife.js`
 * bundles THIS file as an IIFE exposing `window.ChatUI` — the index
 * surface plus the custom-element adapter. It must stay free of
 * top-level DOM access so the script can be injected before
 * DOMContentLoaded or pre-evaluated in non-DOM contexts.
 */
export * from './index.js';
export { ChatUIViewElement, defineChatUIElement } from './adapters/element.js';
