/*
 * chat-ui — attachment helpers: kind detection, type guards, previews.
 *
 * The composer holds `File`s (picked/pasted) and `ChatAttachment`s
 * (host-staged media refs, e.g. a speech recording). These helpers keep
 * the two shapes interchangeable.
 */

import { isSafeUrl } from './markdown.js';
import type { AttachmentKind, ChatAttachment, SubmitAttachment } from './types.js';

/** Discriminate a `SubmitAttachment`: typed refs have `kind`, `File`s don't. */
export function isChatAttachment(item: SubmitAttachment): item is ChatAttachment {
    return (
        typeof item === 'object' &&
        item !== null &&
        !(item instanceof File) &&
        typeof (item as ChatAttachment).kind === 'string' &&
        typeof (item as ChatAttachment).name === 'string'
    );
}

/** Logical kind for an attachment — explicit `kind` or inferred from MIME. */
export function attachmentKindOf(item: SubmitAttachment): AttachmentKind {
    if (isChatAttachment(item)) return item.kind;
    const mime = item.type ?? '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
}

export function attachmentNameOf(item: SubmitAttachment): string {
    return isChatAttachment(item) ? item.name : item.name || 'file';
}

export function attachmentSizeOf(item: SubmitAttachment): number | undefined {
    return isChatAttachment(item) ? item.size : item.size;
}

export interface AttachmentPreview {
    /** URL usable in an `<img>`/`src` attribute. */
    readonly url: string;
    /** Release any object URL held by this preview. */
    revoke(): void;
}

/**
 * Build a preview URL for an attachment. Prefers `URL.createObjectURL`
 * for local files and falls back to `FileReader` data URLs where object
 * URLs are unavailable (e.g. some embedded webviews, jsdom). `data:`/
 * `blob:`/`http(s)` urls on `ChatAttachment` pass through the same URL
 * sanitizer used for markdown images.
 */
export function createAttachmentPreview(item: SubmitAttachment): Promise<AttachmentPreview | null> {
    if (isChatAttachment(item)) {
        if (item.url && isSafeUrl(item.url, true)) return Promise.resolve({ url: item.url, revoke: () => {} });
        if (!item.file) return Promise.resolve(null);
        return previewFromFile(item.file);
    }
    if (attachmentKindOf(item) !== 'image') return Promise.resolve(null);
    return previewFromFile(item);
}

function previewFromFile(file: File): Promise<AttachmentPreview | null> {
    if (!file.type.startsWith('image/')) return Promise.resolve(null);
    const URL_ = globalThis.URL;
    if (URL_ && typeof URL_.createObjectURL === 'function') {
        try {
            const url = URL_.createObjectURL(file);
            return Promise.resolve({ url, revoke: () => URL_.revokeObjectURL(url) });
        } catch {
            /* fall through to FileReader */
        }
    }
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
            resolve(typeof reader.result === 'string' ? { url: reader.result, revoke: () => {} } : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}
