// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findStreamingSplit, isSafeUrl, renderMarkdown, safeEmbedUrl } from '../src/index.js';
import { MarkdownStreamRenderer } from '../src/index.js';

describe('renderMarkdown', () => {
    it('escapes raw HTML', () => {
        expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
        expect(renderMarkdown('a < b')).toContain('&lt;');
    });

    it('renders inline emphasis, code, strike', () => {
        const html = renderMarkdown('**b** *i* `c` ~~s~~');
        expect(html).toContain('<strong>b</strong>');
        expect(html).toContain('<em>i</em>');
        expect(html).toContain('<code>c</code>');
        expect(html).toContain('<del>s</del>');
    });

    it('does not italicize snake_case identifiers', () => {
        expect(renderMarkdown('some_snake_case')).not.toContain('<em>');
    });

    it('protects code spans from emphasis rules', () => {
        expect(renderMarkdown('`**not bold**`')).not.toContain('<strong>');
    });

    it('does not eat plain digits between spaces (placeholder sentinel)', () => {
        expect(renderMarkdown('score 5 points and 10 more `code` end')).toContain('5');
        expect(renderMarkdown('score 5 points and 10 more `code` end')).toContain('10 more');
    });

    it('renders fenced code, including unclosed fences', () => {
        expect(renderMarkdown('```js\nlet a = 1;\n```')).toContain('language-js');
        const open = renderMarkdown('```\npartial code');
        expect(open).toContain('<pre><code>');
        expect(open).toContain('partial code');
    });

    it('renders lists, task lists, blockquotes, headings, hr', () => {
        const html = renderMarkdown('# T\n\n- a\n- b\n\n1. one\n\n- [x] done\n- [ ] todo\n\n> quoted\n\ntext\n\n---\n\nend');
        expect(html).toContain('<h1>T</h1>');
        expect((html.match(/<ul>/g) ?? []).length).toBeGreaterThanOrEqual(1);
        expect(html).toContain('<ol>');
        expect(html).toContain('type="checkbox" disabled checked');
        expect(html).toContain('<blockquote>');
        expect(html).toContain('<hr>');
    });

    it('renders a simple table', () => {
        const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
        expect(html).toContain('<table>');
        expect(html).toContain('<th>a</th>');
        expect(html).toContain('<td>2</td>');
    });

    it('links open in a new tab and reject script protocols', () => {
        expect(renderMarkdown('[x](https://a.b)')).toContain('href="https://a.b"');
        expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript');
        expect(renderMarkdown('[x](data:text/html;base64,xx)')).not.toContain('href=');
    });

    it('keeps entity-obfuscated protocols inert in the emitted DOM', () => {
        // `&#115;` is escaped to `&amp;#115;` upstream, so the emitted
        // attribute decodes once to literal `java&#115;cript:` — never a
        // runnable javascript: scheme.
        const div = document.createElement('div');
        div.innerHTML = renderMarkdown('[x](java&#115;cript:alert(1))');
        const a = div.querySelector('a');
        expect(a?.href.startsWith('javascript:')).toBeFalsy();
    });

    it('does not double-escape URLs containing &', () => {
        const div = document.createElement('div');
        div.innerHTML = renderMarkdown('[x](https://a.b/?q=1&r=2)');
        expect(div.querySelector('a')!.getAttribute('href')).toBe('https://a.b/?q=1&r=2');
    });

    it('allows data:image for images but not svg', () => {
        expect(renderMarkdown('![i](data:image/png;base64,AAAA)')).toContain('<img');
        expect(renderMarkdown('![i](data:image/svg+xml;base64,AAAA)')).not.toContain('<img');
    });
});

describe('isSafeUrl / safeEmbedUrl', () => {
    it('accepts http(s), relative, mailto; blocks scripts and file', () => {
        expect(isSafeUrl('https://a.b/c')).toBe(true);
        expect(isSafeUrl('/rel/path')).toBe(true);
        expect(isSafeUrl('#anchor')).toBe(true);
        expect(isSafeUrl('mailto:a@b.c')).toBe(true);
        expect(isSafeUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeUrl('vbscript:x')).toBe(false);
        expect(isSafeUrl('file:///etc/passwd')).toBe(false);
        expect(isSafeUrl('  java\tscript:alert(1)')).toBe(false);
    });

    it('safeEmbedUrl allows blob and data:media, not data:html', () => {
        expect(safeEmbedUrl('blob:https://x/123')).toBe('blob:https://x/123');
        expect(safeEmbedUrl('data:audio/wav;base64,AAAA')).toBe('data:audio/wav;base64,AAAA');
        expect(safeEmbedUrl('data:text/html;base64,AAAA')).toBeNull();
        expect(safeEmbedUrl('javascript:alert(1)')).toBeNull();
    });
});

describe('findStreamingSplit', () => {
    it('splits at the last safe paragraph mark', () => {
        expect(findStreamingSplit('a\n\nb')).toBe(3);
        expect(findStreamingSplit('a\n\nb\nc')).toBe(3);
        expect(findStreamingSplit('a\n\nb\n\nc')).toBe(6);
    });

    it('does not split inside an unclosed code fence', () => {
        expect(findStreamingSplit('```\n\nx')).toBe(0);
        expect(findStreamingSplit('p\n\n```\n\ncode')).toBe(3);
        expect(findStreamingSplit('```\nx\n```\n\nafter')).toBe(11);
    });

    it('waits for content after a mark that may precede a horizontal rule', () => {
        expect(findStreamingSplit('a\n\n')).toBe(0); // mark at end is ambiguous
        expect(findStreamingSplit('a\n\n-')).toBe(0); // could become ---
        expect(findStreamingSplit('a\n\n--')).toBe(0);
        expect(findStreamingSplit('a\n\n---')).toBe(0); // rule keeps mark unsplit
        expect(findStreamingSplit('a\n\n---\n\nb')).toBe(8); // mark after the rule is safe
        expect(findStreamingSplit('a\n\n- item')).toBe(3); // proven to be a list
    });
});

describe('MarkdownStreamRenderer', () => {
    it('freezes complete paragraphs and re-renders only the tail', () => {
        const container = document.createElement('div');
        const stream = new MarkdownStreamRenderer(container);
        stream.append('first para');
        expect(container.querySelectorAll('.cui-md-seg').length).toBe(0);
        expect(container.querySelector('.cui-md-tail')!.textContent).toBe('first para');
        stream.append('\n\nsecond');
        expect(container.querySelectorAll('.cui-md-seg').length).toBe(1);
        expect(container.querySelector('.cui-md-seg')!.textContent).toBe('first para');
        expect(container.querySelector('.cui-md-tail')!.textContent).toBe('second');
    });

    it('renders partial inline constructs literally until complete', () => {
        const container = document.createElement('div');
        const stream = new MarkdownStreamRenderer(container);
        stream.append('a **bo');
        expect(container.querySelector('.cui-md-tail')!.innerHTML).not.toContain('<strong>');
        stream.append('ld** done');
        expect(container.querySelector('.cui-md-tail')!.innerHTML).toContain('<strong>bold</strong>');
    });

    it('does not freeze a paragraph mark inside an unclosed fence', () => {
        const container = document.createElement('div');
        const stream = new MarkdownStreamRenderer(container);
        stream.append('```\ncode line\n\nmore code');
        expect(container.querySelectorAll('.cui-md-seg').length).toBe(0);
        stream.append('\n```\n\nafter');
        expect(container.querySelectorAll('.cui-md-seg').length).toBe(1);
        expect(container.querySelector('.cui-md-tail')!.textContent).toBe('after');
    });

    it('keeps a trailing --- literal in the tail until proven', () => {
        const container = document.createElement('div');
        const stream = new MarkdownStreamRenderer(container);
        stream.append('a\n\n-');
        expect(container.querySelectorAll('.cui-md-seg').length).toBe(0);
        stream.append('--\n\nb');
        // frozen segment contains para + rule together
        expect(container.querySelector('.cui-md-seg')!.innerHTML).toContain('<hr>');
        expect(container.querySelector('.cui-md-tail')!.textContent).toBe('b');
    });

    it('finish() re-renders the full text once', () => {
        const container = document.createElement('div');
        const stream = new MarkdownStreamRenderer(container);
        stream.append('- one\n\n- two');
        stream.finish();
        expect(container.querySelectorAll('.cui-md-seg').length).toBe(0);
        expect(container.querySelectorAll('ul li').length).toBeGreaterThanOrEqual(1);
        expect(container.textContent).toContain('two');
    });
});
