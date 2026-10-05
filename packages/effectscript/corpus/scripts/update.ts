/**
 * `pnpm corpus:update` (ADR-0094): moves every project to the tip of its branch, without history,
 * and rewrites the pins in `corpus.json`. Commit the new pins with the new `REPORT.md`.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { type Manifest, update } from "../src/projects.ts"

const file = path.join(import.meta.dirname, "..", "corpus.json")
const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest & { readonly $comment: string }
const projects = manifest.projects.map((project) => {
  const commit = update(project)
  process.stdout.write(
    `${project.name}: ${
      project.commit === commit ? "unchanged" : `${project.commit.slice(0, 9)} → ${commit.slice(0, 9)}`
    }\n`
  )
  return { ...project, commit }
})
fs.writeFileSync(file, `${JSON.stringify({ ...manifest, projects }, null, 2)}\n`)
