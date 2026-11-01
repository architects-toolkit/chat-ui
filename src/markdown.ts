/*
 * chat-ui — minimal, dependency-free Markdown renderer.
 *
 * Intentionally small: escapes HTML first (safe by construction), then
 * applies a conservative subset — fenced code, inline code, bold, italic,
 * links, headings, lists, and paragraphs. Rich hosts can replace this via
 * a custom 'markdown' part renderer.
 */

const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
    return esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/** Render a small Markdown subset to an HTML string. Input is escaped. */
export function renderMarkdown(markdown: string): string {
    const blocks: string[] = [];
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    const flushList = (list: string[]) => {
        if (list.length) blocks.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
        list.length = 0;
    };
    const list: string[] = [];

    while (i < lines.length) {
        const line = lines[i] ?? '';
        if (line.trimStart().startsWith('```')) {
            flushList(list);
            const buf: string[] = [];
            i++;
            while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) buf.push(lines[i++] ?? '');
            i++;
            blocks.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
            continue;
        }
        const trimmed = line.trim();
        if (trimmed === '') {
            flushList(list);
            i++;
            continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
        if (heading) {
            flushList(list);
            const level = (heading[1] ?? '#').length;
            blocks.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
            i++;
            continue;
        }
        const item = /^[-*]\s+(.*)$/.exec(trimmed);
        if (item) {
            list.push(item[1] ?? '');
            i++;
            continue;
        }
        flushList(list);
        blocks.push(`<p>${inline(trimmed)}</p>`);
        i++;
    }
    flushList(list);
    return blocks.join('');
}
