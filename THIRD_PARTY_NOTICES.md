# Third-party notices

This project contains code ported from the following MIT-licensed
projects. The original copyright and license are reproduced below.

## Deep Chat

- **Project**: [deep-chat](https://github.com/OvidijusParsiunas/deep-chat)
- **Author**: Ovidijus Parsiunas
- **License**: MIT

Ported algorithms (adapted, not vendored wholesale):

- `src/markdown.ts` — `findStreamingSplit`: the streaming partial-render
  split-point rule (safe `\n\n` marks must not sit inside an unclosed
  code fence and must not precede a possible `---` horizontal rule);
  `isSafeUrl`/`safeEmbedUrl`: URL sanitization that decodes numeric
  entities and strips characters browsers ignore inside protocols before
  classifying the scheme (`validateLink` in Deep Chat).
- `src/markdown-stream.ts` — incremental-render structure: freeze
  completed paragraph segments, re-render only the unstable tail
  (`MessageStream` `partialRender` in Deep Chat).
- `src/chat-view.ts` — scroll anchoring ("at bottom" check before DOM
  mutation, scroll only when pinned) and the IME composition guard
  (ignore Enter while `compositionstart`–`compositionend` is active).

### MIT License

```
MIT License

Copyright (c) 2024 Ovidijus Parsiunas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
