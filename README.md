# chat-ui

A framework-agnostic, transport-agnostic, embeddable chat view for AI assistants and agent UIs.

One small TypeScript core that mounts a complete chat surface — message list, streaming, composer, status line, optional panels — onto **any DOM element**, in any host: a React/Vue/Svelte app, a plain HTML page, a native webview (WebView2, WKWebView, Electron), or a widget inside another application. The host drives it through a small imperative handle and supplies user intent via an injected transport; the view never performs I/O itself.

## Why

AI chat UIs keep being rebuilt per product and per framework. This package separates:

- **The view** — DOM rendering, streaming deltas, composer state, panels. One implementation, shared everywhere.
- **The transport** — how a "send" reaches your conversation engine (HTTP, SSE, a native-webview bridge, a worker, a test double). Injected by the host.
- **The features** — capability map: each optional UI region (message queue, context card, quote chip, attachments, cost chip, in-message actions) is enabled per host.

## Install

```bash
npm install @architects-toolkit/chat-ui
```

## Quick start (any DOM host)

```ts
import { createChatView } from '@architects-toolkit/chat-ui';

const view = createChatView(document.getElementById('app')!, {
  transport: {
    async send({ text, attachments }) { /* deliver to your backend/session */ },
    cancel() { /* abort the in-flight response */ },
  },
  features: { queue: true, contextCard: true, quoteChip: true },
  placeholder: 'Type a message…',
});

view.setStatus('Ready');
view.addMessage({
  id: '1',
  role: 'assistant',
  parts: [{ type: 'markdown', text: 'Hello — **streaming** works via `appendDelta`.' }],
});
view.appendDelta('1', ' …more text');
```

## Custom element (plain HTML / webviews)

```html
<chat-ui-view id="chat"></chat-ui-view>
<script type="module">
  import { defineChatUIElement } from '@architects-toolkit/chat-ui/element';
  defineChatUIElement();

  const handle = document.getElementById('chat').init({
    transport: { send: ({ text }) => window.hostBridge?.send(text) },
  });
  // A native host can now call `handle.addMessage(...)` through its bridge.
</script>
```

## React

```tsx
function Chat({ transport }: { transport: ChatTransport }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = createChatView(ref.current!, { transport });
    return () => view.destroy();
  }, [transport]);
  return <div ref={ref} style={{ height: '100%' }} />;
}
```

## Feature map

| Feature | UI it enables | Transport members used |
| --- | --- | --- |
| `queue` | outgoing-message panel: edit / send-now / remove | `editQueued`, `sendQueuedNow`, `removeQueued` |
| `contextCard` | context-usage meter + elapsed time | — (`setContextUsage`) |
| `quoteChip` | staged quote chip above the composer | — (`stageQuote`/`getQuote`) |
| `attachments` | 📎 button; files flow into `ChatSubmit.attachments` | — |
| `costChip` | per-message meta/cost chip | — |
| `messageActions` | action buttons in `card` parts | `messageAction` |

## Theming

Every visual token is a CSS custom property under `--cui-*` (`--cui-bg`, `--cui-accent`, `--cui-radius`, …). Set them on the `.chat-ui` element or a parent; add `data-theme="dark"` for the built-in dark palette. Pass `unstyled: true` to disable the injected stylesheet entirely.

## Design

See [DESIGN.md](./DESIGN.md) for the architecture contract: message/parts model, transport lifecycle, renderer registry, and versioning rules.

## License

MIT © architects-toolkit contributors
