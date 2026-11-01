// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
    createChatView,
    interactionPatchToMessage,
    interactionToMessage,
    interactionsToMessages,
    normalizeInteraction,
} from '../src/index.js';
import type {
    CanonicalInteraction,
    CanonicalPart,
    ChatTransport,
    JsonValue,
} from '../src/index.js';
import * as iife from '../src/iife.js';

function mount(transport?: Partial<ChatTransport>, extra?: object) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createChatView(host, {
        transport: { send: vi.fn(), ...transport },
        ...extra,
    });
    return { host, view };
}

const EVERY_PART: readonly CanonicalPart[] = [
    { type: 'text', text: 'plain' },
    { type: 'markdown', text: '**bold**' },
    { type: 'html', html: '<em>trusted</em>' },
    { type: 'image', src: 'https://x/pic.png', alt: 'pic' },
    { type: 'audio', src: 'https://x/clip.wav', name: 'clip' },
    { type: 'video', src: 'https://x/mov.mp4', poster: 'https://x/p.png' },
    { type: 'divider' },
    { type: 'tool_call', name: 'search', args: '{"q":"x"}', status: 'done' },
    { type: 'tool_result', name: 'search', content: '42 hits' },
    { type: 'quote', text: 'quoted', source: 'doc' },
    { type: 'suggestions', prompts: ['a', 'b'] },
    { type: 'usage', usage: { tokensIn: 10, tokensOut: 5, cost: 0.001 } },
    { type: 'evidence', text: 'note', level: 'warning' },
    { type: 'card', kind: 'task_plan', data: { steps: [{ label: 's' }] } },
];

/* ------------------------------------------------------------------ */
/* interactionToMessage — strict validation + normalization            */
/* ------------------------------------------------------------------ */

describe('interactionToMessage', () => {
    it('converts a minimal interaction', () => {
        const msg = interactionToMessage({
            id: 'i1', role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
        });
        expect(msg).toEqual({
            id: 'i1', role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
        });
    });

    it('preserves domKey, status and meta', () => {
        const meta: Record<string, JsonValue> = { turn: 3, tags: ['a'] };
        const msg = interactionToMessage({
            id: 'i', domKey: 'k', role: 'assistant', status: 'streaming',
            parts: [], meta,
        });
        expect(msg.domKey).toBe('k');
        expect(msg.status).toBe('streaming');
        expect(msg.meta).toEqual(meta);
    });

    it('maps the canonical-only background role to system', () => {
        const msg = interactionToMessage({ id: 'i', role: 'background', parts: [] });
        expect(msg.role).toBe('system');
    });

    it('falls back to assistant for unknown roles', () => {
        const msg = interactionToMessage(
            { id: 'i', role: 'wizard', parts: [] } as unknown as CanonicalInteraction,
        );
        expect(msg.role).toBe('assistant');
    });

    it('throws TypeError on non-object input', () => {
        for (const bad of [null, undefined, 'x', 5, []]) {
            expect(() => interactionToMessage(bad as unknown as CanonicalInteraction)).toThrow(TypeError);
        }
    });

    it('throws TypeError when id is missing or empty', () => {
        for (const bad of [{ role: 'user', parts: [] }, { id: '', role: 'user', parts: [] }, { id: 4, role: 'user', parts: [] }]) {
            expect(() => interactionToMessage(bad as unknown as CanonicalInteraction)).toThrow(TypeError);
        }
    });

    it('throws TypeError when parts is not an array', () => {
        expect(() =>
            interactionToMessage({ id: 'i', role: 'user', parts: 'x' } as unknown as CanonicalInteraction),
        ).toThrow(TypeError);
    });

    it('drops malformed part entries but keeps well-formed custom types', () => {
        const msg = interactionToMessage({
            id: 'i', role: 'assistant',
            parts: [
                null,
                'text',
                { nope: true },
                { type: 'text', text: 'ok' },
                { type: 'host:custom', payload: 1 },
            ] as unknown as CanonicalPart[],
        });
        expect(msg.parts).toEqual([
            { type: 'text', text: 'ok' },
            { type: 'host:custom', payload: 1 },
        ]);
    });

    it('survives a JSON round-trip for every part type', () => {
        const interaction: CanonicalInteraction = {
            id: 'rt', role: 'assistant', status: 'done',
            parts: EVERY_PART,
            meta: { nested: { list: [1, 'x', null] } },
        };
        const wire = JSON.parse(JSON.stringify(interaction)) as CanonicalInteraction;
        const msg = interactionToMessage(wire);
        expect(msg.parts).toHaveLength(EVERY_PART.length);
        expect(msg.meta).toEqual(interaction.meta);
        expect(wire).toEqual(interaction);
    });
});

/* ------------------------------------------------------------------ */
/* normalizeInteraction — tolerant path for partial/streamed objects    */
/* ------------------------------------------------------------------ */

describe('normalizeInteraction', () => {
    it('fills defaults for an empty object', () => {
        const n = normalizeInteraction({});
        expect(n.id).toMatch(/^cui-\d+$/);
        expect(n.role).toBe('assistant');
        expect(n.parts).toEqual([]);
        expect(n.status).toBeUndefined();
        expect(n.domKey).toBeUndefined();
        expect(n.meta).toBeUndefined();
    });

    it('generates unique ids and tolerates non-object input', () => {
        const a = normalizeInteraction(null);
        const b = normalizeInteraction('junk');
        expect(a.id).not.toBe(b.id);
        expect(() => interactionToMessage(a)).not.toThrow();
    });

    it('keeps supplied fields and drops malformed ones', () => {
        const n = normalizeInteraction({
            id: 'keep', role: 'background', status: 'bogus',
            parts: [{ type: 'text', text: 'x' }, 42],
            meta: { a: 1 },
        });
        expect(n.id).toBe('keep');
        expect(n.role).toBe('background');
        expect(n.status).toBeUndefined();
        expect(n.parts).toEqual([{ type: 'text', text: 'x' }]);
        expect(n.meta).toEqual({ a: 1 });
    });
});

/* ------------------------------------------------------------------ */
/* interactionsToMessages + patch mapping                              */
/* ------------------------------------------------------------------ */

describe('interactionsToMessages / interactionPatchToMessage', () => {
    it('converts a list and propagates the first validation error', () => {
        const list: CanonicalInteraction[] = [
            { id: 'a', role: 'user', parts: [] },
            { id: 'b', role: 'assistant', parts: [] },
        ];
        expect(interactionsToMessages(list).map((m) => m.id)).toEqual(['a', 'b']);
        expect(() =>
            interactionsToMessages([{ id: '', role: 'user', parts: [] }]),
        ).toThrow(TypeError);
    });

    it('normalizes patch fields leniently', () => {
        const patch = interactionPatchToMessage({
            role: 'background',
            parts: [{ type: 'text', text: 'p' }, null] as unknown as CanonicalPart[],
            status: 'done',
        });
        expect(patch.role).toBe('system');
        expect(patch.parts).toEqual([{ type: 'text', text: 'p' }]);
        expect(patch.status).toBe('done');
        expect(interactionPatchToMessage({})).toEqual({});
    });
});

/* ------------------------------------------------------------------ */
/* ChatViewHandle canonical delegates                                  */
/* ------------------------------------------------------------------ */

describe('handle interaction delegates', () => {
    it('addInteraction renders like addMessage', () => {
        const { host, view } = mount();
        view.addInteraction({
            id: 'i', role: 'assistant',
            parts: [{ type: 'markdown', text: '**hi**' }],
        });
        expect(host.querySelector('.cui-part-markdown')!.innerHTML).toContain('<strong>hi</strong>');
        expect(host.querySelector('.cui-msg')!.getAttribute('data-role')).toBe('assistant');
    });

    it('addInteraction normalizes the background role', () => {
        const { host, view } = mount();
        view.addInteraction({ id: 'i', role: 'background', parts: [{ type: 'evidence', text: 'bg' }] });
        expect(host.querySelector('.cui-msg')!.getAttribute('data-role')).toBe('system');
    });

    it('addInteraction throws on an invalid wire object', () => {
        const { view } = mount();
        expect(() =>
            view.addInteraction({ role: 'user', parts: [] } as unknown as CanonicalInteraction),
        ).toThrow(TypeError);
    });

    it('updateInteraction patches an existing interaction', () => {
        const { host, view } = mount();
        view.addInteraction({
            id: 'i', domKey: 'k', role: 'assistant', status: 'streaming',
            parts: [{ type: 'markdown', text: '' }],
        });
        view.appendDelta('k', '**str**');
        view.updateInteraction('k', { status: 'done', role: 'background' });
        const msg = host.querySelector('.cui-msg')!;
        expect(msg.getAttribute('data-status')).toBe('done');
        expect(msg.getAttribute('data-role')).toBe('system');
        expect(host.querySelector('.cui-part-markdown')!.innerHTML).toContain('<strong>str</strong>');
    });

    it('updateInteraction replaces parts', () => {
        const { host, view } = mount();
        view.addInteraction({ id: 'i', domKey: 'k', role: 'assistant', parts: [{ type: 'text', text: 'a' }] });
        view.updateInteraction('k', { parts: [{ type: 'quote', text: 'q', source: 's' }] });
        expect(host.querySelector('.cui-part-quote cite')!.textContent).toBe('s');
        expect(host.querySelector('.cui-part-text')).toBeNull();
    });

    it('updateInteraction on an unknown key is a no-op', () => {
        const { host, view } = mount();
        view.updateInteraction('ghost', { status: 'done' });
        expect(host.querySelector('.cui-msg')).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/* Canonical round-trip → render (all part types)                       */
/* ------------------------------------------------------------------ */

describe('canonical part round-trip render', () => {
    it('renders every part type from a JSON-round-tripped interaction', () => {
        const { host, view } = mount();
        const wire = JSON.parse(JSON.stringify({
            id: 'rt', role: 'assistant', parts: EVERY_PART,
        })) as CanonicalInteraction;
        view.addInteraction(wire);
        const sel = (s: string) => host.querySelector(s);
        expect(sel('.cui-part-text')!.textContent).toBe('plain');
        expect(sel('.cui-part-markdown strong')).toBeTruthy();
        expect(sel('.cui-part-html em')).toBeTruthy();
        expect(sel('.cui-part-image img')).toBeTruthy();
        expect(sel('audio')).toBeTruthy();
        expect(sel('video')).toBeTruthy();
        expect(sel('hr')).toBeTruthy();
        expect(sel('.cui-part-tool_call')!.textContent).toContain('search');
        expect(sel('.cui-part-tool_result')!.textContent).toContain('42 hits');
        expect(sel('.cui-part-quote cite')!.textContent).toBe('doc');
        expect(sel('.cui-suggestions')!.children.length).toBe(2);
        expect(sel('.cui-usage')!.textContent).toContain('10 in');
        expect(sel('.cui-evidence')!.getAttribute('data-level')).toBe('warning');
        expect(sel('.cui-card[data-kind="task_plan"]')).toBeTruthy();
    });
});

/* ------------------------------------------------------------------ */
/* Bundle surface (what the IIFE exposes as window.ChatUI)             */
/* ------------------------------------------------------------------ */

describe('bundle surface', () => {
    it('exposes the complete window.ChatUI API', () => {
        for (const key of [
            'createChatView',
            'defineChatUIElement',
            'MarkdownStreamRenderer',
            'DEFAULT_STYLES',
            'interactionToMessage',
            'interactionsToMessages',
            'normalizeInteraction',
            'renderMarkdown',
        ]) {
            expect(iife[key as keyof typeof iife], key).toBeDefined();
        }
        expect(typeof iife.createChatView).toBe('function');
        expect(typeof iife.defineChatUIElement).toBe('function');
        expect(typeof iife.DEFAULT_STYLES).toBe('string');
    });

    it('defineChatUIElement registers the element idempotently', () => {
        iife.defineChatUIElement();
        iife.defineChatUIElement();
        expect(customElements.get('chat-ui-view')).toBe(iife.ChatUIViewElement);
    });
});
