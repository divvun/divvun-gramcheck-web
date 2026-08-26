import { APIGrammarError } from './api';

/**
 * Word Critique/Annotation API integration.
 *
 * Uses WordApi 1.7 (critiques) and 1.8 (popup options) to insert
 * colored underlines directly in the document with clickable suggestion popups.
 *
 * Feature detection is used at runtime — the add-in degrades gracefully
 * to sidebar-only mode on older Word versions.
 */

// ── Feature detection ────────────────────────────────────────────────

export function supportsCritiques(): boolean {
    return Office.context.requirements.isSetSupported('WordApi', '1.7');
}

export function supportsCritiquePopups(): boolean {
    return Office.context.requirements.isSetSupported('WordApi', '1.8');
}

// ── Color scheme mapping ─────────────────────────────────────────────

/**
 * Map grammar error codes to Word critique color schemes.
 * Word supports: Red, Green, Blue, Lavender, Berry
 */
type CritiqueColorScheme = 'Red' | 'Green' | 'Blue' | 'Lavender' | 'Berry';

function getColorScheme(errorCode: string): CritiqueColorScheme {
    // Spelling-like errors get red
    if (errorCode.startsWith('msyn-') || errorCode.startsWith('real-')) {
        return 'Red';
    }
    // Punctuation/whitespace errors get blue
    if (errorCode.startsWith('punct-') || errorCode.startsWith('space-')) {
        return 'Blue';
    }
    // Style suggestions get lavender
    if (errorCode.startsWith('style-') || errorCode.startsWith('typo-')) {
        return 'Lavender';
    }
    // Default: red for grammar errors
    return 'Red';
}

// ── Annotation tracking ─────────────────────────────────────────────

/**
 * Metadata we store per annotation so we can correlate
 * Word annotations back to our API error data.
 */
export interface AnnotationMeta {
    paragraphIndex: number;
    errorIndex: number;
    error: APIGrammarError;
    annotationId?: string;
}

// In-memory map from annotation ID to our metadata.
// Cleared on each full grammar check run.
const annotationMap = new Map<string, AnnotationMeta>();

export function getAnnotationMeta(annotationId: string): AnnotationMeta | undefined {
    return annotationMap.get(annotationId);
}

export function clearAnnotationMap(): void {
    annotationMap.clear();
}

export function getAllAnnotationMetas(): AnnotationMeta[] {
    return Array.from(annotationMap.values());
}

// ── Insert annotations for a paragraph ──────────────────────────────

/**
 * Insert critique annotations for all errors in a single paragraph.
 * Must be called inside a Word.run context.
 *
 * @param context - Word request context
 * @param paragraphIndex - index of the paragraph in document body
 * @param errors - grammar errors from API (already filtered)
 * @returns array of annotation IDs created
 */
export async function insertAnnotationsForParagraph(
    context: Word.RequestContext,
    paragraphIndex: number,
    errors: APIGrammarError[],
): Promise<string[]> {
    if (errors.length === 0) return [];

    const paragraphs = context.document.body.paragraphs;
    paragraphs.load('items');
    await context.sync();

    const paragraph = paragraphs.items[paragraphIndex];
    if (!paragraph) return [];

    const hasPopups = supportsCritiquePopups();

    // Build critiques array — Word requires non-overlapping critiques sorted by position
    const sortedErrors = errors
        .map((e, i) => ({ error: e, originalIndex: i }))
        .sort((a, b) => a.error.start_index - b.error.start_index);

    // Remove overlapping critiques (keep first occurrence)
    const nonOverlapping: typeof sortedErrors = [];
    let lastEnd = -1;
    for (const item of sortedErrors) {
        if (item.error.start_index >= lastEnd) {
            nonOverlapping.push(item);
            lastEnd = item.error.end_index;
        }
    }

    const critiques: any[] = nonOverlapping.map((item) => {
        const e = item.error;
        const length = e.end_index - e.start_index;

        const critique: any = {
            colorScheme: (Word as any).CritiqueColorScheme
                ? (Word as any).CritiqueColorScheme[getColorScheme(e.error_code)]
                : getColorScheme(e.error_code),
            start: e.start_index,
            length: length,
        };

        // Add popup options if WordApi 1.8 is available
        if (hasPopups && e.suggestions.length > 0) {
            critique.popupOptions = {
                brandingTextResourceId: 'Divvun.Critique.Branding',
                subtitleResourceId: 'Divvun.Critique.Subtitle',
                suggestions: e.suggestions.slice(0, 5), // Word limits to ~5 suggestions
            };
        }

        return critique;
    });

    // Insert annotations
    const result = (paragraph as any).insertAnnotations({ critiques });
    await context.sync();

    // Map annotation IDs to our metadata
    const annotationIds: string[] = [];
    if (result && result.value) {
        const ids: string[] = result.value;
        for (let i = 0; i < ids.length && i < nonOverlapping.length; i++) {
            const id = ids[i];
            if (id) {
                annotationIds.push(id);
                annotationMap.set(id, {
                    paragraphIndex,
                    errorIndex: nonOverlapping[i].originalIndex,
                    error: nonOverlapping[i].error,
                    annotationId: id,
                });
            }
        }
    }

    return annotationIds;
}

// ── Remove all annotations ──────────────────────────────────────────

/**
 * Delete all tracked annotations from the document.
 * Safe to call even if some annotations were already removed by user edits.
 */
export async function removeAllAnnotations(context: Word.RequestContext): Promise<void> {
    const ids = Array.from(annotationMap.keys());
    if (ids.length === 0) return;

    for (const id of ids) {
        try {
            const annotation = (context.document.body as any).getAnnotationById(id);
            annotation.delete();
        } catch (_) {
            // Annotation may have been auto-removed by user edit
        }
    }

    try {
        await context.sync();
    } catch (_) {
        // Some deletes may fail — that's fine
    }

    clearAnnotationMap();
}

// ── Remove annotations for a specific paragraph ─────────────────────

/**
 * Remove all annotations that belong to a specific paragraph index.
 */
export async function removeAnnotationsForParagraph(
    context: Word.RequestContext,
    paragraphIndex: number,
): Promise<void> {
    const toRemove: string[] = [];

    for (const [id, meta] of annotationMap) {
        if (meta.paragraphIndex === paragraphIndex) {
            toRemove.push(id);
        }
    }

    for (const id of toRemove) {
        try {
            const annotation = (context.document.body as any).getAnnotationById(id);
            annotation.delete();
        } catch (_) {
            // Already removed
        }
        annotationMap.delete(id);
    }

    if (toRemove.length > 0) {
        try {
            await context.sync();
        } catch (_) {}
    }
}

// ── Event handler registration ──────────────────────────────────────

export interface AnnotationEventHandlers {
    onAnnotationClicked?: (annotationId: string, meta: AnnotationMeta | undefined) => void;
    onAnnotationPopupAction?: (annotationId: string, action: string, meta: AnnotationMeta | undefined) => void;
    onAnnotationRemoved?: (annotationIds: string[]) => void;
    onParagraphChanged?: (paragraphIndex: number) => void;
}

/**
 * Register event handlers for annotation and paragraph events.
 * Returns a cleanup function that removes all handlers.
 */
export function registerAnnotationEvents(
    handlers: AnnotationEventHandlers,
): () => void {
    const cleanupFns: Array<() => void> = [];

    if (handlers.onAnnotationClicked) {
        const handler = handlers.onAnnotationClicked;
        const wrappedHandler = (args: any) => {
            const ids: string[] = args?.ids || [];
            for (const id of ids) {
                handler(id, annotationMap.get(id));
            }
        };

        Word.run(async (context) => {
            (context.document.body as any).onAnnotationClicked.add(wrappedHandler);
            await context.sync();
        });

        cleanupFns.push(() => {
            Word.run(async (context) => {
                (context.document.body as any).onAnnotationClicked.remove(wrappedHandler);
                await context.sync();
            });
        });
    }

    if (handlers.onAnnotationPopupAction) {
        const handler = handlers.onAnnotationPopupAction;
        const wrappedHandler = (args: any) => {
            const id = args?.id;
            const action = args?.action;
            if (id) {
                handler(id, action, annotationMap.get(id));
            }
        };

        Word.run(async (context) => {
            (context.document.body as any).onAnnotationPopupAction.add(wrappedHandler);
            await context.sync();
        });

        cleanupFns.push(() => {
            Word.run(async (context) => {
                (context.document.body as any).onAnnotationPopupAction.remove(wrappedHandler);
                await context.sync();
            });
        });
    }

    if (handlers.onAnnotationRemoved) {
        const handler = handlers.onAnnotationRemoved;
        const wrappedHandler = (args: any) => {
            const ids: string[] = args?.ids || [];
            // Clean our map
            for (const id of ids) {
                annotationMap.delete(id);
            }
            handler(ids);
        };

        Word.run(async (context) => {
            (context.document.body as any).onAnnotationRemoved.add(wrappedHandler);
            await context.sync();
        });

        cleanupFns.push(() => {
            Word.run(async (context) => {
                (context.document.body as any).onAnnotationRemoved.remove(wrappedHandler);
                await context.sync();
            });
        });
    }

    if (handlers.onParagraphChanged) {
        const handler = handlers.onParagraphChanged;
        const wrappedHandler = (args: any) => {
            // args.paragraphIndex gives the changed paragraph
            const paragraphIndex = args?.paragraphIndex;
            if (typeof paragraphIndex === 'number') {
                handler(paragraphIndex);
            }
        };

        Word.run(async (context) => {
            (context.document.body as any).onParagraphChanged.add(wrappedHandler);
            await context.sync();
        });

        cleanupFns.push(() => {
            Word.run(async (context) => {
                (context.document.body as any).onParagraphChanged.remove(wrappedHandler);
                await context.sync();
            });
        });
    }

    return () => {
        for (const fn of cleanupFns) {
            try { fn(); } catch (_) {}
        }
    };
}

/**
 * Accept a critique annotation (user clicked a suggestion in the popup).
 * Word auto-applies the text replacement. We just need to update our tracking.
 */
export function handlePopupAccept(annotationId: string): void {
    annotationMap.delete(annotationId);
}

/**
 * Reject/dismiss a critique annotation from the popup.
 */
export async function rejectAnnotation(annotationId: string): Promise<void> {
    annotationMap.delete(annotationId);

    try {
        await Word.run(async (context) => {
            const annotation = (context.document.body as any).getAnnotationById(annotationId);
            annotation.delete();
            await context.sync();
        });
    } catch (_) {
        // Already gone
    }
}
