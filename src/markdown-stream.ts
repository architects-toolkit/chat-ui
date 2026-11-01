/*
 * chat-ui — incremental markdown renderer for token streaming.
 *
 * Design ported from Deep Chat (https://github.com/OvidijusParsiunas/deep-chat)
 * "partial render" streaming (MIT license, (c) 2024 Ovidijus Parsiunas —
 * see THIRD_PARTY_NOTICES.md):
 *
 *   - Accumulated text is split at safe paragraph boundaries
 *     (see findStreamingSplit in markdown.ts).
 *   - Each completed segment is rendered ONCE into a frozen element, so
 *     earlier content never re-parses or flickers.
 *   - Only the unstable tail re-renders per delta; partial constructs
 *     (`**`, ```` ``` ````, `[label](`) render literally until complete.
 *   - finish() re-renders the whole text once for a canonical final DOM.
 */

import { findStreamingSplit, renderMarkdown } from './markdown.js';

export type MarkdownRendererFn = (markdown: string) => string;

export interface MarkdownStreamOptions {
    /** Custom markdown → HTML renderer; defaults to the bundled subset. */
    readonly render?: MarkdownRendererFn;
}

const SEGMENT_CLASS = 'cui-md-seg';
const TAIL_CLASS = 'cui-md-tail';

export class MarkdownStreamRenderer {
    private readonly container: HTMLElement;
    private readonly customRender?: MarkdownRendererFn;
    private text = '';
    /** Length of the prefix already committed to frozen segments. */
    private frozen = 0;
    private finished = false;
    private tailEl: HTMLElement;

    constructor(container: HTMLElement, options?: MarkdownStreamOptions) {
        this.container = container;
        if (options?.render) this.customRender = options.render;
        const doc = container.ownerDocument;
        this.tailEl = doc.createElement('div');
        this.tailEl.className = TAIL_CLASS;
        container.appendChild(this.tailEl);
    }

    /** Raw text accumulated so far. */
    get markdown(): string {
        return this.text;
    }

    /** Append a delta; completed paragraphs freeze, the tail re-renders. */
    append(delta: string): void {
        if (!delta) return;
        if (this.finished) {
            // stream resumed after a final render — rebuild state
            const prior = this.text;
            this.reset();
            this.text = prior;
            this.finished = false;
        }
        this.text += delta;
        let split = findStreamingSplit(this.text);
        while (split > this.frozen) {
            const segment = this.text.substring(this.frozen, split - 2);
            this.freezeSegment(segment);
            this.frozen = split;
            split = findStreamingSplit(this.text);
        }
        this.renderTail();
    }

    /**
     * Final render: collapses frozen segments + tail into a single
     * canonical render of the full text (fixes constructs that spanned
     * segment boundaries, e.g. loose lists).
     */
    finish(): void {
        const full = this.text;
        this.container.replaceChildren();
        const doc = this.container.ownerDocument;
        this.tailEl = doc.createElement('div');
        this.tailEl.className = TAIL_CLASS;
        this.tailEl.innerHTML = this.render(full);
        this.container.appendChild(this.tailEl);
        this.finished = true;
    }

    /** Drop all rendered content and reset accumulation. */
    reset(): void {
        this.text = '';
        this.frozen = 0;
        this.finished = false;
        this.container.replaceChildren();
        const doc = this.container.ownerDocument;
        this.tailEl = doc.createElement('div');
        this.tailEl.className = TAIL_CLASS;
        this.container.appendChild(this.tailEl);
    }

    private freezeSegment(markdown: string): void {
        const doc = this.container.ownerDocument;
        const seg = doc.createElement('div');
        seg.className = SEGMENT_CLASS;
        seg.innerHTML = this.render(markdown);
        this.container.insertBefore(seg, this.tailEl);
    }

    private renderTail(): void {
        const tail = this.text.substring(this.frozen);
        this.tailEl.innerHTML = tail === '' ? '' : this.renderTailHtml(tail);
    }

    private render(markdown: string): string {
        return this.customRender ? this.customRender(markdown) : renderMarkdown(markdown);
    }

    private renderTailHtml(tail: string): string {
        if (this.customRender) return this.customRender(tail);
        // streaming-tail mode keeps a trailing `---`/`***` line literal
        // until a following line proves it is a rule
        return renderMarkdown(tail, { streamingTail: true });
    }
}
