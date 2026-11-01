/*
 * chat-ui — minimal, dependency-free Markdown renderer.
 *
 * Intentionally small: escapes HTML first (safe by construction), then
 * applies a conservative subset — fenced code, inline code, bold, italic,
 * strikethrough, links, images, headings, lists, task lists, blockquotes,
 * tables, horizontal rules, and paragraphs. Rich hosts can replace this
 * via `ChatViewOptions.renderMarkdown` or a custom 'markdown' part
 * renderer.
 *
 * This file also carries the streaming-split algorithm and the URL
 * sanitizer ported from Deep Chat (https://github.com/OvidijusParsiunas/deep-chat),
 * MIT license — see THIRD_PARTY_NOTICES.md.
 */

const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/* URL sanitization                                                    */
/* ------------------------------------------------------------------ */
/*
 * Ported from Deep Chat's `RemarkableConfig.validateLink` (MIT, (c) 2024
 * Ovidijus Parsiunas). Decodes numeric entities and strips characters
 * browsers ignore inside protocols (e.g. "java\tscript:") before
 * classifying the scheme, then blocks script-executing protocols while
 * still allowing `data:image/*` where requested.
 */

const decodeEntities = (url: string): string =>
    url.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, code: string) =>
        String.fromCodePoint(
            code[0]!.toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10),
        ),
    );

/**
 * Whether a URL is safe to emit into `href`/`src`. Blocks `javascript:`,
 * `vbscript:` and `file:` outright; `data:` is only accepted for
 * `data:image/*` (never SVG) when `allowDataImage` is set. Protocol-free
 * URLs (relative, anchors, query-only) are allowed.
 */
export function isSafeUrl(url: string, allowDataImage = false): boolean {
    const str = Array.from(decodeEntities(url))
        .filter((char) => char.charCodeAt(0) > 32)
        .join('')
        .toLowerCase();
    const protocol = /^([a-z][a-z0-9+.-]*):/.exec(str)?.[1];
    if (!protocol) return true;
    if (protocol === 'data') {
        return allowDataImage && str.startsWith('data:image/') && !str.startsWith('data:image/svg');
    }
    return !['javascript', 'vbscript', 'file'].includes(protocol);
}

/**
 * Sanitize a URL for media/embed contexts (`img`, `audio`, `video`,
 * attachment previews). Same denylist as {@link isSafeUrl}; `data:` is
 * accepted for `image/` (except SVG), `audio/` and `video/` media types
 * only, and `blob:` object URLs are allowed. Returns `null` when unsafe.
 */
export function safeEmbedUrl(url: string): string | null {
    const cleaned = Array.from(decodeEntities(url))
        .filter((char) => char.charCodeAt(0) > 32)
        .join('');
    const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
    if (!protocol) return url;
    if (protocol === 'data') {
        const lower = cleaned.toLowerCase();
        const ok = /^data:(image|audio|video)\//.test(lower) && !lower.startsWith('data:image/svg');
        return ok ? url : null;
    }
    return ['javascript', 'vbscript', 'file'].includes(protocol) ? null : url;
}

/* ------------------------------------------------------------------ */
/* Inline constructs                                                   */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = '\u0000';

interface InlineState {
    /** Extracted constructs stored as final HTML, restored after rules run. */
    readonly stashed: string[];
}

function stash(state: InlineState, html: string): string {
    state.stashed.push(html);
    return `${PLACEHOLDER}${state.stashed.length - 1}${PLACEHOLDER}`;
}

function restore(state: InlineState, s: string): string {
    return s.replace(
        new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
        (_, i: string) => state.stashed[Number(i)] ?? '',
    );
}

/**
 * Render an `<a>` or `<img>`; unsafe URLs degrade to literal text.
 * `label`/`url`/`title` arrive already HTML-escaped — emit them verbatim.
 */
function linkOrImage(state: InlineState, bang: string, label: string, url: string, title?: string): string {
    const isImage = bang === '!';
    const cleanUrl = url.trim();
    if (!isSafeUrl(cleanUrl, isImage)) return `${bang}[${label}](${cleanUrl})`;
    const titleAttr = title ? ` title="${title}"` : '';
    if (isImage) return stash(state, `<img src="${cleanUrl}" alt="${label}"${titleAttr}>`);
    const inner = inlineEmphasis(label);
    return stash(state, `<a href="${cleanUrl}"${titleAttr} target="_blank" rel="noopener noreferrer">${inner}</a>`);
}

/** Emphasis/strength/strike only — used recursively inside link labels. */
function inlineEmphasis(s: string): string {
    return s
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^A-Za-z0-9_])__([^_]+)__/g, '$1<strong>$2</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/(^|[^A-Za-z0-9_])_([^_]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/**
 * Render inline markdown inside an already-HTML-escaped string.
 * Code spans and links/images are stashed as placeholders first so
 * their contents cannot be mangled by emphasis rules.
 */
function inline(escaped: string): string {
    const state: InlineState = { stashed: [] };
    let s = escaped;

    // code spans: ``code`` then `code`
    s = s
        .replace(/``([^`]+)``/g, (_, code: string) => stash(state, `<code>${code}</code>`))
        .replace(/`([^`\n]+)`/g, (_, code: string) => stash(state, `<code>${code}</code>`));

    // images / links: ![alt](url "title") / [label](url "title")
    s = s.replace(
        /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
        (_, bang: string, label: string, url: string, title?: string) =>
            linkOrImage(state, bang, label, url, title),
    );

    // autolinks: &lt;https://…&gt;
    s = s.replace(/&lt;((?:https?|mailto):[^\s&]+)&gt;/g, (_, url: string) => {
        if (!isSafeUrl(url)) return `&lt;${url}&gt;`;
        return stash(state, `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    });

    s = inlineEmphasis(s);
    return restore(state, s);
}

/* ------------------------------------------------------------------ */
/* Block constructs                                                    */
/* ------------------------------------------------------------------ */

const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*\d{1,9}[.)]\s+(.*)$/;
const OL_NUM = /^\s*(\d{1,9})[.)]\s/;
const indentOf = (l: string) => l.length - l.trimStart().length;
const TASK_ITEM = /^\[( |x|X)\]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;
const MAX_QUOTE_DEPTH = 4;

interface RenderOptions {
    /**
     * Streaming-tail mode: a horizontal-rule pattern on the very last
     * line is ambiguous (`---` may grow into `---> arrow` or a list).
     * It renders as plain text until proven by a following line.
     */
    readonly streamingTail?: boolean;
    readonly quoteDepth?: number;
}

const splitRow = (line: string): string[] =>
    line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function renderTable(lines: string[], start: number): { html: string; next: number } | null {
    const headerLine = lines[start] ?? '';
    const sepLine = lines[start + 1] ?? '';
    if (!headerLine.includes('|') || !TABLE_SEP.test(sepLine)) return null;
    const header = splitRow(headerLine);
    if (header.length === 0) return null;
    const aligns = splitRow(sepLine).map((cell) => {
        const l = cell.startsWith(':');
        const r = cell.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
    });
    const rows: string[][] = [];
    let i = start + 2;
    while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
        rows.push(splitRow(lines[i] ?? ''));
        i++;
    }
    const alignAttr = (n: number) => (aligns[n] ? ` style="text-align:${aligns[n]}"` : '');
    const th = header.map((c, n) => `<th${alignAttr(n)}>${inline(esc(c))}</th>`).join('');
    const trs = rows
        .map((r) => `<tr>${r.map((c, n) => `<td${alignAttr(n)}>${inline(esc(c))}</td>`).join('')}</tr>`)
        .join('');
    return { html: `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`, next: i };
}

/**
 * Render a small Markdown subset to an HTML string. Input is escaped —
 * raw HTML in the source is never emitted.
 */
export function renderMarkdown(markdown: string, options?: RenderOptions): string {
    const quoteDepth = options?.quoteDepth ?? 0;
    const blocks: string[] = [];
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    const list: { tag: 'ul' | 'ol'; items: string[]; indent: number; start?: number | undefined } = { tag: 'ul', items: [], indent: 0 };
    const flushList = () => {
        if (!list.items.length) return;
        const start = list.tag === 'ol' && list.start != null && list.start !== 1 ? ` start="${list.start}"` : '';
        blocks.push(`<${list.tag}${start}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`);
        list.items.length = 0;
        list.start = undefined;
    };

    while (i < lines.length) {
        const line = lines[i] ?? '';

        // fenced code — an unclosed fence consumes the rest (streaming-safe)
        if (line.trimStart().startsWith('```')) {
            flushList();
            const lang = line.trimStart().slice(3).trim();
            const buf: string[] = [];
            i++;
            while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) buf.push(lines[i++] ?? '');
            if (i < lines.length) i++; // consume the closing fence when present
            const cls = lang ? ` class="language-${esc(lang)}"` : '';
            blocks.push(`<pre><code${cls}>${esc(buf.join('\n'))}</code></pre>`);
            continue;
        }

        const trimmed = line.trim();
        if (trimmed === '') {
            // A blank line only ends an open list when the next non-blank
            // line is not a list item at this list's level or deeper —
            // otherwise "1. a\n\n2. b" would split the <ol> and restart
            // numbering (loose lists stay one list).
            if (list.items.length) {
                let j = i + 1;
                while (j < lines.length && (lines[j] ?? '').trim() === '') j++;
                const next = lines[j] ?? '';
                const continues = (UL_ITEM.test(next) || OL_ITEM.test(next)) && indentOf(next) >= list.indent;
                if (!continues) flushList();
            }
            i++;
            continue;
        }

        // horizontal rule — only after a blank line/start, or as the
        // final (possibly incomplete) streaming line
        if (HR.test(trimmed)) {
            const isLastLine = i === lines.length - 1;
            if (options?.streamingTail && isLastLine) {
                flushList();
                blocks.push(`<p>${inline(esc(trimmed))}</p>`);
            } else {
                flushList();
                blocks.push('<hr>');
            }
            i++;
            continue;
        }

        const heading = HEADING.exec(trimmed);
        if (heading) {
            flushList();
            const level = Math.min(6, (trimmed.match(/^#+/)?.[0] ?? '#').length);
            blocks.push(`<h${level}>${inline(esc(heading[1] ?? ''))}</h${level}>`);
            i++;
            continue;
        }

        // blockquote — consecutive '>' lines, recursively rendered
        if (trimmed.startsWith('>')) {
            flushList();
            const inner: string[] = [];
            while (i < lines.length && (lines[i] ?? '').trimStart().startsWith('>')) {
                inner.push((lines[i] ?? '').trimStart().replace(/^>\s?/, ''));
                i++;
            }
            const html =
                quoteDepth < MAX_QUOTE_DEPTH
                    ? renderMarkdown(inner.join('\n'), { ...options, quoteDepth: quoteDepth + 1 })
                    : esc(inner.join('\n'));
            blocks.push(`<blockquote>${html}</blockquote>`);
            continue;
        }

        // table — header row + `---|---` separator row
        const table = renderTable(lines, i);
        if (table) {
            flushList();
            blocks.push(table.html);
            i = table.next;
            continue;
        }

        const ulMatch = UL_ITEM.exec(line);
        const olMatch = ulMatch ? null : OL_ITEM.exec(line);
        if (ulMatch || olMatch) {
            const tag = ulMatch ? 'ul' : 'ol';
            const indent = indentOf(line);

            if (list.items.length && indent > list.indent) {
                // Deeper-indented line = content nested inside the last
                // item (e.g. "- sub" under "1. item"). Gather the whole
                // sub-block and render it inside the current <li> instead
                // of flushing — a same-level <ul> between numbered items
                // would close the <ol> and restart numbering at 1.
                const sub: string[] = [];
                while (i < lines.length && (lines[i] ?? '').trim() !== '' && indentOf(lines[i] ?? '') > list.indent) {
                    sub.push(lines[i] ?? '');
                    i++;
                }
                const minIndent = Math.min(...sub.map((l) => indentOf(l)));
                const nested = renderMarkdown(sub.map((l) => l.slice(minIndent)).join('\n'), options);
                list.items[list.items.length - 1] += nested;
                continue;
            }

            if (list.tag !== tag || (list.items.length && indent < list.indent)) flushList();
            if (!list.items.length) {
                list.tag = tag;
                list.indent = indent;
                const num = olMatch ? OL_NUM.exec(line)?.[1] : undefined;
                if (num && num !== '1') list.start = Number(num);
            }
            let item = (ulMatch ?? olMatch)?.[1] ?? '';
            const task = TASK_ITEM.exec(item);
            if (task) {
                const checked = task[1]!.toLowerCase() === 'x' ? ' checked' : '';
                item = `<input type="checkbox" disabled${checked}> ${inline(esc(task[2] ?? ''))}`;
                list.items.push(item);
            } else {
                list.items.push(inline(esc(item)));
            }
            i++;
            continue;
        }

        // paragraph — consecutive non-blank lines joined with <br>
        flushList();
        const para: string[] = [];
        while (i < lines.length) {
            const l = lines[i] ?? '';
            const t = l.trim();
            if (
                t === '' ||
                t.startsWith('```') ||
                t.startsWith('>') ||
                HEADING.test(t) ||
                HR.test(t) ||
                UL_ITEM.test(l) ||
                OL_ITEM.test(l) ||
                (l.includes('|') && TABLE_SEP.test(lines[i + 1] ?? ''))
            ) {
                break;
            }
            para.push(t);
            i++;
        }
        if (para.length) {
            blocks.push(`<p>${para.map((p) => inline(esc(p))).join('<br>')}</p>`);
        } else {
            i++; // safety: always make progress
        }
    }
    flushList();
    return blocks.join('');
}

/* ------------------------------------------------------------------ */
/* Streaming split                                                     */
/* ------------------------------------------------------------------ */
/*
 * Ported from Deep Chat's `MessageStream` partial-render logic (MIT,
 * (c) 2024 Ovidijus Parsiunas) — see THIRD_PARTY_NOTICES.md.
 *
 * A `\n\n` mark is a safe split point only when it is NOT inside an
 * unclosed code fence (odd ``` count before the mark) and NOT ambiguous
 * with a horizontal-rule pattern: text after the mark starting with
 * `---` — or still a proper prefix of it — waits for more content
 * (Deep Chat issue #500).
 */

const PARAGRAPH_MARK = '\n\n';

/**
 * Returns the index just past the LAST safe paragraph mark — i.e.
 * `text.slice(0, index - 2)` is complete enough to freeze and
 * `text.slice(index)` is the unstable tail. `0` means nothing is
 * safe to freeze yet.
 */
export function findStreamingSplit(text: string): number {
    let lastSafe = 0;
    let searchFrom = 0;
    let markIndex = text.indexOf(PARAGRAPH_MARK, searchFrom);
    while (markIndex !== -1) {
        const fences = text.substring(0, markIndex).match(/```/g);
        const isInsideCodeBlock = !!fences && fences.length % 2 === 1;
        const textAfterMark = text.substring(markIndex + PARAGRAPH_MARK.length);
        const isHorizontalRule = textAfterMark.startsWith('---') || '---'.startsWith(textAfterMark);
        if (!isInsideCodeBlock && !isHorizontalRule) lastSafe = markIndex + PARAGRAPH_MARK.length;
        searchFrom = markIndex + 1;
        markIndex = text.indexOf(PARAGRAPH_MARK, searchFrom);
    }
    return lastSafe;
}
