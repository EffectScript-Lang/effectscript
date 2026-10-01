#!/usr/bin/env node
// Published builds use dist/; the workspace (or EFFECTSCRIPT_DEV=1) uses the TypeScript sources
// (Node >= 22.18 strips types).
import { existsSync } from "node:fs"

const dist = process.env.EFFECTSCRIPT_DEV !== "1" && existsSync(new URL("../dist/cli/main.js", import.meta.url))
const { main } = await import(dist ? "../dist/cli/main.js" : "../src/cli/main.ts")
process.exitCode = await main(process.argv.slice(2))
