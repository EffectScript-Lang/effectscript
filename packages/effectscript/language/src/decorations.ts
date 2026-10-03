/**
 * Editor glue shared by EffectScript's editor integrations, free of any editor's API so it is
 * tested on its own.
 *
 * @since 4.0.0
 */

/**
 * Which editors show effect binds (ADR-0039): every visible EffectScript editor, split views and
 * other editor groups included, or, after an edit, every editor showing the edited document
 * (Plan 21).
 *
 * @since 4.0.0
 * @category editors
 */
export const editorsToDecorate = <D, E extends { readonly document: D }>(
  visible: ReadonlyArray<E>,
  edited: D | undefined,
  isEffectScript: (document: D) => boolean
): Array<E> => visible.filter((e) => isEffectScript(e.document) && (edited === undefined || e.document === edited))
