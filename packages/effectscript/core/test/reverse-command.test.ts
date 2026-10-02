import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

describe("reverse: command (Plan 7 Task 8)", () => {
  it.each([
    [
      "flags, arguments, docs and a description",
      "import { Schema } from \"effect\"\n\nconst Email = Schema.String.pipe(Schema.check(Schema.isPattern(/@/)))\n\n/** Create a task */\nexport command create(\n  /** Task title */ title: NonEmptyString,\n  /** Priority */ --priority: \"low\" | \"normal\" | \"high\" = \"normal\",\n  /** Assignee email @alias a */ --assignee?: Email,\n  --dryRun: boolean = false,\n  --count: Int,\n) {\n  console.log(`Created \"${title}\" with ${priority} priority`)\n}\n"
    ],
    ["no parameters, a pipe", "command ping() {\n  console.log(\"pong\")\n} |> withDescription(\"Ping\")\n"],
    [
      "a scoped handler",
      "declare const close: Effect<void>\n\ncommand run(\n  --verbose: boolean,\n) {\n  defer close\n  console.log(verbose)\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx)).toBe(efx)
  })

  it.each([
    ["a flag whose name isn't the kebab name", "Flag.Boolean(\"dryrun\")"],
    ["an unknown chain step", "Flag.Boolean(\"dry-run\").pipe(Flag.withFallbackConfig(Config.succeed(true)))"]
  ])("keeps %s as TypeScript", (_name, flag) => {
    const ts =
      `import { Config, Effect } from "effect"\nimport { Command, Flag } from "effect/cli"\nexport const c = Command.make("c", {\n  dryRun: ${flag}\n}, Effect.fn("c")(function*({ dryRun }) {\n  return dryRun\n}))\n`
    expect(expectSafe(ts).code).toContain("Command.make(")
  })
})
