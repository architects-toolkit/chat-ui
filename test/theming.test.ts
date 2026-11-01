// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatView, DEFAULT_STYLES } from '../src/index.js';
import type { ChatTransport, ChatViewOptions } from '../src/index.js';

function mount(options: Omit<ChatViewOptions, 'transport'> = {}, transport?: Partial<ChatTransport>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createChatView(host, {
        transport: { send: vi.fn(), ...transport },
        ...options,
    });
    return { host, view };
}

const cuiSheets = (): HTMLStyleElement[] => [
    ...document.head.querySelectorAll<HTMLStyleElement>('style[data-cui-styles]'),
];

beforeEach(() => {
    // Sheets are injected into document.head — reset between mounts.
    cuiSheets().forEach((s) => s.remove());
    document.body.replaceChildren();
});

describe('theming', () => {
    it('declares the tunable token layer on .chat-ui in the default sheet', () => {
        for (const token of [
            '--cui-font-size:',
            '--cui-font-size-sm:',
            '--cui-line-height:',
            '--cui-font-mono:',
            '--cui-gap:',
            '--cui-pad:',
            '--cui-border-width:',
            '--cui-shadow:',
            '--cui-shadow-sm:',
            '--cui-bubble-maxw:',
            '--cui-ok:',
            '--cui-warn:',
            '--cui-accent-subtle:',
        ]) {
            expect(DEFAULT_STYLES, token).toContain(token);
        }
    });

    it('wires rules through the tokens', () => {
        for (const rule of [
            'font-family: var(--cui-font-mono)',
            'font-size: var(--cui-font-size)',
            'line-height: var(--cui-line-height)',
            'gap: var(--cui-gap)',
            'padding: var(--cui-pad)',
            'max-width: var(--cui-bubble-maxw)',
            'box-shadow: var(--cui-shadow)',
            'box-shadow: var(--cui-shadow-sm)',
            'border: var(--cui-border-width) solid var(--cui-border)',
            'background: var(--cui-accent-subtle)',
        ]) {
            expect(DEFAULT_STYLES, rule).toContain(rule);
        }
    });

    it('keeps the built-in dark palette behind data-theme', () => {
        expect(DEFAULT_STYLES).toContain(".chat-ui[data-theme='dark']");
    });

    it('replaces the hard-coded ok/warn hexes with semantic tokens', () => {
        expect(DEFAULT_STYLES).not.toMatch(/#2f9e57/i);
        expect(DEFAULT_STYLES).not.toMatch(/#a07a1f/i);
        for (const use of [
            '.cui-evidence[data-level=\'warning\'] { color: var(--cui-warn)',
            '.cui-ref-verified { color: var(--cui-ok)',
            ".cui-card[data-state='approved'] { border-color: var(--cui-ok)",
            ".cui-task-step[data-status='done'] .cui-task-icon { color: var(--cui-ok)",
            ".cui-subagent-badge[data-tone='ok'] { color: var(--cui-ok)",
            ".cui-subagent-badge[data-tone='warn'] { color: var(--cui-warn)",
        ]) {
            expect(DEFAULT_STYLES, use).toContain(use);
        }
    });

    it('injects exactly one identifiable default sheet per mount', () => {
        mount();
        const sheets = cuiSheets();
        expect(sheets.length).toBe(1);
        expect(sheets[0]!.getAttribute('data-cui-styles')).toBe('default');
        expect(sheets[0]!.textContent).toBe(DEFAULT_STYLES);
    });

    it('stamps data-theme on the root when options.theme is set', () => {
        const { host } = mount({ theme: 'dark' });
        expect(host.querySelector('.chat-ui')!.getAttribute('data-theme')).toBe('dark');
    });

    it('accepts host-defined theme names', () => {
        const { host } = mount({ theme: 'brand' });
        expect(host.querySelector<HTMLElement>('.chat-ui')!.dataset.theme).toBe('brand');
    });

    it('leaves data-theme unset by default', () => {
        const { host } = mount();
        expect(host.querySelector('.chat-ui')!.hasAttribute('data-theme')).toBe(false);
    });

    it('injects extraCss as a second sheet after the default one', () => {
        const css = ".chat-ui { --cui-accent: #b8f540; --cui-border-width: 0.5px; }";
        mount({ extraCss: css });
        const sheets = cuiSheets();
        expect(sheets.length).toBe(2);
        expect(sheets[0]!.getAttribute('data-cui-styles')).toBe('default');
        expect(sheets[1]!.getAttribute('data-cui-styles')).toBe('extra');
        expect(sheets[1]!.textContent).toBe(css);
    });

    it('suppresses DEFAULT_STYLES under unstyled but still injects extraCss', () => {
        const css = '.chat-ui { --cui-bg: #0b0b0d; }';
        mount({ unstyled: true, extraCss: css });
        const sheets = cuiSheets();
        expect(sheets.length).toBe(1);
        expect(sheets[0]!.getAttribute('data-cui-styles')).toBe('extra');
        expect(sheets[0]!.textContent).toBe(css);
    });

    it('injects no sheet when unstyled and no extraCss', () => {
        mount({ unstyled: true });
        expect(cuiSheets().length).toBe(0);
    });
});
