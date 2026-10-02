#!/usr/bin/env node
// The standalone EffectScript language server (ADR-0040): `efx-language-server --stdio`.
// Published builds use dist/; the workspace (or EFFECTSCRIPT_DEV=1) uses the TypeScript sources
// (Node >= 22.18 strips types).
import { existsSync } from "node:fs"

const dist = process.env.EFFECTSCRIPT_DEV !== "1" && existsSync(new URL("../dist/languageServer.js", import.meta.url))
const { startLanguageServer } = await import(dist ? "../dist/languageServer.js" : "../src/languageServer.ts")
startLanguageServer()
