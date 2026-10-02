/** The totals of the Effect docs in EffectScript (ADR-0050), read from its generated report. */
const report = import.meta.glob<string>("../../../effect-docs/content/REPORT.md", {
  query: "?raw",
  import: "default",
  eager: true
})

export const corpusTotals = () => {
  const text = Object.values(report)[0]!
  const row = text.split("\n").find((line) => line.startsWith("| **total** |"))!
  const cells = row.split("|").map((c) => c.trim().replaceAll("*", ""))
  return { examples: Number(cells[2]), resugared: Number(cells[3]), saved: cells[8]! }
}
