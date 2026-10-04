/**
 * `effectscript/blume-facts` (ADR-0079, spec §4.4): marks the Returns / Fails with / Needs rows that
 * `efx docs` writes, so the theme can colour them by Effect's A / E / R. The `effectscript()` Blume
 * integration runs it in the browser on every page: Blume's Markdown processor takes no plugins.
 *
 * @since 4.0.0
 */

const kinds: Record<string, "a" | "e" | "r"> = { "Returns": "a", "Fails with": "e", "Needs": "r" }

/**
 * The channel a facts label names: `a` for success, `e` for errors, `r` for requirements.
 *
 * @since 4.0.0
 * @category facts
 */
export const factKind = (label: string): "a" | "e" | "r" | undefined => kinds[label]

/** An `efx docs` facts table has no header text; Blume may drop the empty header row entirely. */
const headerless = (table: HTMLTableElement): boolean =>
  table.tHead === null || (table.tHead.textContent ?? "").trim() === ""

/** The label of a row whose first cell is exactly one bold label, else undefined. */
const labelOf = (row: Element): string | undefined => {
  const cell = row.firstElementChild
  if (cell === null || cell.children.length !== 1) return undefined
  const strong = cell.children[0]!
  if (strong.tagName !== "STRONG") return undefined
  const label = (strong.textContent ?? "").trim()
  return (cell.textContent ?? "").trim() === label ? label : undefined
}

/**
 * Marks every facts row under `root` with `data-efx-fact` and returns how many rows carry it. It is
 * idempotent, so it can run again after Blume's client-side navigation.
 *
 * @since 4.0.0
 * @category facts
 */
export const markFacts = (root: ParentNode): number => {
  let marked = 0
  for (const table of root.querySelectorAll("table")) {
    if (!headerless(table)) continue
    for (const row of table.querySelectorAll<HTMLElement>(":scope > tbody > tr")) {
      const label = labelOf(row)
      const kind = label === undefined ? undefined : factKind(label)
      if (kind === undefined) continue
      row.dataset.efxFact = kind
      marked++
    }
  }
  return marked
}
