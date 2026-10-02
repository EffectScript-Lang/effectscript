import { parseArgs } from "node:util"

// Help text, validation and defaults are all separate from the types
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    priority: { type: "string", default: "normal" },
    "dry-run": { type: "boolean", short: "n", default: false },
    help: { type: "boolean", default: false }
  }
})

if (values.help || positionals.length !== 1) {
  console.log("usage: create <title> [--priority low|normal|high] [--dry-run|-n]")
  process.exit(values.help ? 0 : 1)
}
if (!["low", "normal", "high"].includes(values.priority)) {
  console.error(`invalid priority: ${values.priority}`)
  process.exit(1)
}
const prefix = values["dry-run"] ? "[dry run] " : ""
console.log(`${prefix}created "${positionals[0]}" with ${values.priority} priority`)
