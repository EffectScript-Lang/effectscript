/**
 * `pnpm codegen` for `@effectscript/docs` (ADR-0050): writes `content/`, the Effect docs and
 * examples in EffectScript. With `--check`, reports drift instead (exit 1).
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { drift, generate } from "../src/generate.ts"

const content = path.join(import.meta.dirname, "../content")
const files = generate(path.join(import.meta.dirname, "../../../.."))
if (process.argv.includes("--check")) {
  const problems = drift(files, content)
  for (const problem of problems) process.stderr.write(`${problem}\n`)
  if (problems.length > 0) {
    process.stderr.write("content/ is stale: run pnpm codegen in packages/effectscript/docs\n")
    process.exitCode = 1
  }
} else {
  fs.rmSync(content, { recursive: true, force: true })
  for (const [file, text] of files) {
    fs.mkdirSync(path.dirname(path.join(content, file)), { recursive: true })
    fs.writeFileSync(path.join(content, file), text)
  }
  process.stdout.write(`wrote ${files.size} files to content/\n`)
}
