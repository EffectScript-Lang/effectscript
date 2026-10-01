#!/usr/bin/env node
// Published builds use dist/; the workspace uses the TypeScript sources (Node >= 22.18 strips types).
import { existsSync } from "node:fs"

const entry = existsSync(new URL("../dist/cli/main.js", import.meta.url)) ? "../dist/cli/main.js" : "../src/cli/main.ts"
const { main } = await import(entry)
process.exitCode = main(process.argv.slice(2))
