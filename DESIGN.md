# chat-ui — design principles

A platform-independent UI toolkit for building LLM chat interfaces: message primitives, a composer, a transport contract, renderer slots, and a feature map.

## 1. One view, every host

`createChatView(element, options)` is the entire integration surface. It mounts a complete chat surface onto any DOM element and returns an imperative `ChatViewHandle`. Anything that hosts DOM — a SPA, a static page, a native webview (WebView2/WKWebView/Electron), an extension panel — can embed the same view with no framework runtime. Frameworks integrate through thin wrappers (the `<chat-ui-view>` custom element, a 5-line React/Vue/Svelte adapter) rather than separate implementations.

## 2. Transport is injected, never imported

The view performs **zero I/O**. Everything the user can trigger flows through a host-supplied `ChatTransport` (`send`, `cancel`, queue ops, `messageAction`, `selectModel`). This makes the view embeddable over any channel — HTTP+SSE, WebSocket, a native-webview postMessage bridge, a worker, or a test double — and keeps the package free of fetch/auth/session policy.

All interactive part surfaces funnel through `messageAction(messageId, action, payload)`: question answers `{ answer }`, approval decisions `{ decision }`, model-select changes `{ model }`, suggestion picks `{ text }`, and generic actions rows. The composer model picker reports through `selectModel(modelId)`.

## 3. Features are opt-in, not forked

A capability map (`ChatFeatures`) switches each optional region (queue panel, context card, quote chip, attachments + preview strip, model picker, cost chip, message actions) on per host. The DOM for disabled features is not rendered, and interactive controls render disabled when `messageActions`/`messageAction` are absent. `inputModes` is a declared affordance list for hosts layering extra input (e.g. speech) — no always-on UI.

## 4. Messages are data; parts are extensible

`ChatMessage` is a serializable value: role, status, and an ordered `parts` array. Built-in renderers cover `text`, `markdown`, `html`, `image`, `audio`, `video`, `quote`, `suggestions`, `usage`, `evidence`, `tool_call`, `tool_result`, `divider`, and four typed `card` kinds (`task_plan`, `question`, `approval`, `model_select`). Everything else resolves through the renderer registry: `partRenderers['card:<kind>']` → `partRenderers[<type>]` → `partRenderers['card']`. A small set of generic card kinds plus host renderers is preferred over a large bespoke enum.

## 5. Streaming is incremental and anchor-safe

`appendDelta` targets the last `text`/`markdown` part. Markdown targets stream through `MarkdownStreamRenderer`: accumulated text splits at *safe* paragraph marks — a `\n\n` is unsafe inside an unclosed ```` ``` ```` fence or when the following text could still become a `---` rule — completed segments render once into frozen elements, and only the tail re-renders per delta. The final `updateMessage`/`finish()` re-renders canonically. (Algorithm ported from Deep Chat's partial-render streaming; see `THIRD_PARTY_NOTICES.md`.)

## 6. The scroll follows the user, not the stream

The message list re-pins to the bottom only while the user is at/near the bottom; scrolling up detaches it and surfaces a "↓ Latest" jump button. User-authored messages always pin. Scrolling is instant `scrollTop` assignment — no animation, inherently `prefers-reduced-motion` safe.

## 7. Input respects composition

Enter submits only outside an active IME composition (`compositionstart`/`compositionend`, `isComposing`, `keyCode 229`); Escape is likewise guarded so composition cancellation never clears a staged quote. The composer autosizes, accepts pasted files when `attachments` is on, and stages attachments (files and typed `ChatAttachment` refs) with image previews.

## 8. Theming is token-based

The default stylesheet consumes `--cui-*` custom properties only. Re-theming = setting tokens; `data-theme="dark"` selects the dark palette; `unstyled: true` removes the injected sheet entirely.

## 9. Safety by default

Text/markdown parts are escaped before rendering; `html` parts are documented as host-trusted. Link/media URLs pass a sanitizer that decodes entities and strips protocol-obfuscating characters, blocking `javascript:`/`vbscript:`/`file:` and non-media `data:` (media `data:`/`blob:` are allowed on image/audio/video/embed surfaces). The library ships no remote assets, no telemetry, and no dependencies at runtime.

## 10. Contract stability

`ChatViewHandle` is the stable imperative surface hosts program against (add/update/delta/remove messages, queue, status, processing, quote, models, attachments, scroll). Its methods are the compatibility contract — internal DOM layout and class names may evolve within majors, handle semantics may not. Breaking changes bump MAJOR under semver.

## 11. The canonical interaction contract (v2)

Hosts converge on **one serialized shape** — `CanonicalInteraction` (`src/interactions.ts`) — instead of constructing `ChatMessage` values ad hoc. Each host maps its own domain objects (message DTOs, interaction objects, stream events) into the canonical JSON, then hands it to the view. The shape is JSON-safe: `JSON.parse(JSON.stringify(i))` is lossless, so it crosses HTTP/SSE/native-bridge/worker boundaries without codecs.

Entry points:

- `interactionToMessage(i)` — strict conversion: validates the minimal wire invariants (`id` non-empty, `parts` an array), throws `TypeError` on violations, normalizes the rest.
- `normalizeInteraction(input)` — tolerant conversion for partial/streamed objects: generates a session-unique `cui-N` id when absent, defaults `role` to `'assistant'`, `parts` to `[]`. Never throws.
- `interactionsToMessages(list)` / `interactionPatchToMessage(patch)` — batch and patch helpers.
- `handle.addInteraction(i)` / `handle.updateInteraction(domKey, patch)` — delegates over `addMessage`/`updateMessage` so hosts program purely against the canonical vocabulary.

Normalization semantics every consumer can rely on:

- `role: 'background'` — a canonical-only role for background-agent/audit turns — maps to the `'system'` render role. The four `ChatRole` values pass through; anything else becomes `'assistant'`.
- `CanonicalPart` **is** `MessagePart` — one union, one definition, aliased for wire naming.
- Malformed part entries (non-objects, missing `type`) are dropped at the boundary; unknown-but-well-formed `type`s pass through to the `partRenderers` registry — custom parts ride the same wire.

The lifecycle mirrors the handle: `addInteraction` → `updateInteraction(domKey, patch)` → `appendDelta(domKey, delta)` for token streaming → `removeMessage(domKey)` to drop.

## Non-goals (by design)

- No transport implementations bundled (HTTP/SSE/bridge live in hosts).
- No conversation state management (threads, persistence) — the view renders what the host feeds it.
- No model/provider abstractions — those belong to the conversation engine.
- No framework plugins in core — wrappers stay thin and optional.
