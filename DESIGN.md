# chat-ui — design principles

## 1. One view, every host

`createChatView(element, options)` is the entire integration surface. It mounts a complete chat surface onto any DOM element and returns an imperative `ChatViewHandle`. Anything that hosts DOM — a SPA, a static page, a native webview (WebView2/WKWebView/Electron), an extension panel — can embed the same view with no framework runtime. Frameworks integrate through thin wrappers (the `<chat-ui-view>` custom element, a 5-line React/Vue/Svelte adapter) rather than separate implementations.

## 2. Transport is injected, never imported

The view performs **zero I/O**. Everything the user can trigger flows through a host-supplied `ChatTransport` (`send`, `cancel`, queue ops, `messageAction`). This makes the view embeddable over any channel — HTTP+SSE, WebSocket, a native-webview postMessage bridge, a worker, or a test double — and keeps the package free of fetch/auth/session policy.

## 3. Features are opt-in, not forked

A capability map (`ChatFeatures`) switches each optional region (queue panel, context card, quote chip, attachments, cost chip, message actions) on per host. Hosts enable only what their backend supports; the DOM for disabled features is not rendered. New capabilities arrive as new feature flags + transport members — never as view forks.

## 4. Messages are data; parts are extensible

`ChatMessage` is a serializable value: role, status, and an ordered `parts` array. Built-in renderers cover `text`, `markdown`, `html`, `image`, `tool_call`, `tool_result`, `divider`; `card` parts and any custom `type` are drawn by host-registered `PartRenderer`s. Hosts may therefore project *their* domain (approvals, citations, metrics, evidence lines) without touching the package.

## 5. Theming is token-based

The default stylesheet consumes `--cui-*` custom properties only. Re-theming = setting tokens; `data-theme="dark"` selects the dark palette; `unstyled: true` removes the injected sheet entirely. No CSS framework, no build-time theme coupling.

## 6. Safety by default

Text/markdown parts are escaped before rendering; `html` parts are documented as host-trusted. The library ships no remote assets, no telemetry, and no dependencies at runtime.

## 7. Contract stability

`ChatViewHandle` is the stable imperative surface hosts program against (add/update/delta/remove messages, queue, status, processing, quote). Its methods are the compatibility contract — internal DOM layout and class names may evolve within majors, handle semantics may not. Breaking changes bump MAJOR under semver.

## Non-goals (by design)

- No transport implementations bundled (HTTP/SSE/bridge live in hosts).
- No conversation state management (threads, persistence) — the view renders what the host feeds it.
- No model/provider abstractions — those belong to the conversation engine.
- No framework plugins in core — wrappers stay thin and optional.
