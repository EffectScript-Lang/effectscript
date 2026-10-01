// tsserver loads plugins with require() and needs the factory as module.exports.
// Published builds use dist/; the workspace (or EFFECTSCRIPT_DEV=1) uses the TypeScript sources
// (Node >= 22.18 strips types).
const { existsSync } = require("node:fs")
const path = require("node:path")

const dist = process.env.EFFECTSCRIPT_DEV !== "1" && existsSync(path.join(__dirname, "../dist/typescriptPlugin.js"))
const plugin = require(dist ? "../dist/typescriptPlugin.js" : "../src/typescriptPlugin.ts")
module.exports = plugin.default ?? plugin.typescriptPlugin
