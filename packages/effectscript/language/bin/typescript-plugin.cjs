// tsserver loads plugins with require() and needs the factory as module.exports.
// Published builds use dist/; the workspace uses the TypeScript sources (Node >= 22.18 strips types).
let plugin
try {
  plugin = require("../dist/typescriptPlugin.js")
} catch {
  plugin = require("../src/typescriptPlugin.ts")
}
module.exports = plugin.default ?? plugin.typescriptPlugin
