#!/usr/bin/env node
// Published builds use dist/; the workspace uses the TypeScript sources (Node >= 22.18 strips types).
import { existsSync } from "node:fs"

const entry = existsSync(new URL("../dist/efxTsc.js", import.meta.url)) ? "../dist/efxTsc.js" : "../src/efxTsc.ts"
const { runEfxTsc } = await import(entry)
runEfxTsc()
