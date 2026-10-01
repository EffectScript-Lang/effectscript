#!/usr/bin/env node
// Published builds use dist/; the workspace (or EFFECTSCRIPT_DEV=1) uses the TypeScript sources
// (Node >= 22.18 strips types).
import { existsSync } from "node:fs"

const dist = process.env.EFFECTSCRIPT_DEV !== "1" && existsSync(new URL("../dist/efxTsc.js", import.meta.url))
const { runEfxTsc } = await import(dist ? "../dist/efxTsc.js" : "../src/efxTsc.ts")
runEfxTsc()
