/*
 * chat-ui — canonical interaction contract (the "v2 protocol").
 *
 * Hosts converge on ONE serialized shape: each host maps its own domain
 * objects (message DTOs, interaction objects, stream events) into a
 * `CanonicalInteraction`, then hands it to the view through
 * `interactionToMessage` / `handle.addInteraction` /
 * `handle.updateInteraction`. The wire shape is plain JSON — every field
 * survives `JSON.parse(JSON.stringify(x))` unchanged — so it crosses any
 * boundary (HTTP, SSE, a native-webview bridge, a worker) without codecs.
 *
 * `CanonicalPart` is an alias of `MessagePart`: the part union the view
 * already renders IS the wire shape — there is exactly one definition.
 *
 * Normalization rules applied by this module:
 *   - `role: 'background'` (a canonical-only role for agent/audit turns)
 *     maps to the `'system'` render role;
 *   - unknown/missing roles fall back to `'assistant'`;
 *   - malformed part entries (non-objects, missing `type`) are dropped;
 *   - `id` + `parts` are the only hard invariants — see
 *     `interactionToMessage` for the strict path and
 *     `normalizeInteraction` for the tolerant one.
 */

import type {
    ChatMessage,
    ChatMessageStatus,
    ChatRole,
    MessagePart,
} from './types.js';

/* ------------------------------------------------------------------ */
/* JSON primitives                                                     */
/* ------------------------------------------------------------------ */

/** A value that survives `JSON.stringify`/`JSON.parse` unchanged. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

/* ------------------------------------------------------------------ */
/* Canonical shapes                                                    */
/* ------------------------------------------------------------------ */

/**
 * Canonical message authorship. The first four values are the render
 * roles (`ChatRole`); `'background'` marks background-agent/audit turns
 * and normalizes to `'system'` on conversion.
 */
export type CanonicalRole = ChatRole | 'background';

/**
 * A renderable fragment of an interaction. Identical to `MessagePart` —
 * this file is the single source of truth for the wire shape, and the
 * alias keeps the two names interchangeable.
 */
export type CanonicalPart = MessagePart;

/**
 * The canonical interaction: the JSON contract hosts converge on.
 *
 * Required on the wire: `id` (non-empty string) and `parts` (array).
 * Everything else is optional. `status` carries the render lifecycle
 * (`queued`/`streaming`/`done`/`error`) so hosts can express the whole
 * message lifecycle in canonical vocabulary.
 */
export interface CanonicalInteraction {
    /** Stable id — required, non-empty. */
    readonly id: string;
    /** Optional stable key for incremental updates (add/edit/replace). */
    readonly domKey?: string;
    /** Who authored the interaction; `'background'` renders as `system`. */
    readonly role: CanonicalRole;
    /** Ordered renderable fragments — the same union as `MessagePart`. */
    readonly parts: readonly CanonicalPart[];
    /** Render lifecycle — drives pending/streaming visuals. */
    readonly status?: ChatMessageStatus;
    /** Free-form JSON-safe host data (`actions`, `usage`, turn ids, …). */
    readonly meta?: Readonly<Record<string, JsonValue>>;
}

/* ------------------------------------------------------------------ */
/* Normalization internals                                             */
/* ------------------------------------------------------------------ */

const CHAT_ROLES: ReadonlySet<string> = new Set<ChatRole>([
    'user', 'assistant', 'system', 'tool',
]);

const STATUSES: ReadonlySet<string> = new Set<ChatMessageStatus>([
    'queued', 'streaming', 'done', 'error',
]);

/** `'background'` → `'system'`; unknown/missing roles → `'assistant'`. */
const toChatRole = (role: unknown): ChatRole => {
    if (role === 'background') return 'system';
    return typeof role === 'string' && CHAT_ROLES.has(role)
        ? (role as ChatRole)
        : 'assistant';
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Drop entries that cannot possibly render: non-objects and objects
 * without a string `type`. Parts with unknown-but-well-formed types are
 * kept — they resolve through the host's `partRenderers` registry.
 */
const sanitizeParts = (parts: readonly unknown[]): MessagePart[] =>
    parts.filter(
        (p): p is MessagePart =>
            isRecord(p) && typeof p['type'] === 'string',
    );

const validStatus = (v: unknown): ChatMessageStatus | undefined =>
    typeof v === 'string' && STATUSES.has(v) ? (v as ChatMessageStatus) : undefined;

/* ------------------------------------------------------------------ */
/* Conversion — the only entry points hosts need                       */
/* ------------------------------------------------------------------ */

let autoSeq = 0;
const autoId = (): string => `cui-${++autoSeq}`;

/**
 * Tolerant entry point for partial or streamed objects: fills every
 * missing field with a default so the result is a complete
 * `CanonicalInteraction`. A missing/invalid `id` gets a generated
 * session-unique id; a missing/invalid `role` becomes `'assistant'`;
 * a missing/invalid `parts` becomes `[]`. Never throws.
 */
export function normalizeInteraction(input: unknown): CanonicalInteraction {
    const raw = isRecord(input) ? input : {};
    const id = typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : autoId();
    const domKey = typeof raw['domKey'] === 'string' ? raw['domKey'] : undefined;
    const role: CanonicalRole =
        raw['role'] === 'background' || (typeof raw['role'] === 'string' && CHAT_ROLES.has(raw['role']))
            ? (raw['role'] as CanonicalRole)
            : 'assistant';
    const parts = sanitizeParts(Array.isArray(raw['parts']) ? raw['parts'] : []);
    const status = validStatus(raw['status']);
    const meta = isRecord(raw['meta']) ? (raw['meta'] as Record<string, JsonValue>) : undefined;
    return {
        id,
        ...(domKey !== undefined ? { domKey } : {}),
        role,
        parts,
        ...(status !== undefined ? { status } : {}),
        ...(meta !== undefined ? { meta } : {}),
    };
}

/**
 * Convert a canonical interaction into the `ChatMessage` the view
 * renders. Validates the minimal wire invariants — `id` must be a
 * non-empty string and `parts` must be an array — then normalizes:
 * `background` → `system` role, malformed part entries dropped,
 * `status`/`meta` passed through when well-formed.
 *
 * Throws `TypeError` on invalid input — feed partial/streamed objects
 * through {@link normalizeInteraction} first when invariants may not
 * hold yet.
 */
export function interactionToMessage(interaction: CanonicalInteraction): ChatMessage {
    if (!isRecord(interaction)) {
        throw new TypeError('CanonicalInteraction must be an object');
    }
    if (typeof interaction.id !== 'string' || interaction.id === '') {
        throw new TypeError('CanonicalInteraction.id must be a non-empty string');
    }
    if (!Array.isArray(interaction.parts)) {
        throw new TypeError('CanonicalInteraction.parts must be an array');
    }
    const domKey = typeof interaction.domKey === 'string' ? interaction.domKey : undefined;
    const status = validStatus(interaction.status);
    const meta = isRecord(interaction.meta)
        ? (interaction.meta as Readonly<Record<string, unknown>>)
        : undefined;
    return {
        id: interaction.id,
        role: toChatRole(interaction.role),
        parts: sanitizeParts(interaction.parts),
        ...(domKey !== undefined ? { domKey } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(meta !== undefined ? { meta } : {}),
    };
}

/** Batch convenience: strict-converts every entry; throws on the first invalid one. */
export function interactionsToMessages(list: readonly CanonicalInteraction[]): ChatMessage[] {
    return list.map(interactionToMessage);
}

/**
 * Map a partial canonical patch (as accepted by `handle.updateInteraction`)
 * onto a `ChatMessage` patch. Lenient like {@link normalizeInteraction}:
 * unknown fields are ignored, malformed ones dropped rather than thrown.
 */
export function interactionPatchToMessage(
    patch: Partial<CanonicalInteraction>,
): Partial<ChatMessage> {
    const status = validStatus(patch.status);
    return {
        ...(typeof patch.id === 'string' && patch.id !== '' ? { id: patch.id } : {}),
        ...(patch.role !== undefined ? { role: toChatRole(patch.role) } : {}),
        ...(Array.isArray(patch.parts) ? { parts: sanitizeParts(patch.parts) } : {}),
        ...(typeof patch.domKey === 'string' ? { domKey: patch.domKey } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(isRecord(patch.meta)
            ? { meta: patch.meta as Readonly<Record<string, unknown>> }
            : {}),
    };
}
