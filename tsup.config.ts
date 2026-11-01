import { defineConfig } from 'tsup';

/*
 * Build matrix:
 *   1. npm consumer surface — multi-file ESM/CJS + declarations
 *      (unchanged: index.js/.cjs/.d.ts + adapters/element.*).
 *   2. vendored single-file ESM — dist/chat-ui.js, the whole index
 *      surface (view, styles, markdown, canonical interactions) inlined
 *      into one importable file for hosts without a bundler.
 *   3. vendored single-file IIFE — dist/chat-ui.iife.js exposes
 *      `window.ChatUI` for plain <script> embeds and native webviews.
 *
 * `dist` is cleaned by the build script, not here: tsup builds the
 * entries of a config array in parallel, so a per-config `clean` would
 * race with sibling outputs.
 */
export default defineConfig([
    {
        entry: ['src/index.ts', 'src/adapters/element.ts'],
        format: ['esm', 'cjs'],
        dts: true,
    },
    {
        entry: { 'chat-ui': 'src/index.ts' },
        format: ['esm'],
        platform: 'browser',
        splitting: false,
    },
    {
        entry: { 'chat-ui': 'src/iife.ts' },
        format: ['iife'],
        platform: 'browser',
        globalName: 'ChatUI',
        outExtension: () => ({ js: '.iife.js' }),
    },
]);
