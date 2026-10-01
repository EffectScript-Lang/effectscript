import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("command (§4.14)", () => {
  it("compiles parameters to Flags and Arguments with JSDoc metadata", () => {
    const { code, diagnostics } = toTypeScript(
      "/** Create a task */\nexport command create(\n  /** Task title */ title: NonEmptyString,\n  /** Priority */ --priority: \"low\" | \"normal\" | \"high\" = \"normal\",\n  /** Assignee email @alias a */ --assignee?: Email,\n  --dryRun: boolean = false,\n) {\n  console.log(`Created \"${title}\" with ${priority} priority`)\n}\n"
    )
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([])
    expect(code).toContain(
      "export const create = Command.make(\"create\", {\n" +
        "  title: Argument.String(\"title\").pipe(Argument.withSchema(Schema.NonEmptyString), Argument.withDescription(\"Task title\")),\n" +
        "  priority: Flag.Literals(\"priority\", [\"low\", \"normal\", \"high\"]).pipe(Flag.withDefault(\"normal\"), Flag.withDescription(\"Priority\")),\n" +
        "  assignee: Flag.String(\"assignee\").pipe(Flag.withSchema(Email), Flag.optional, Flag.withAlias(\"a\"), Flag.withDescription(\"Assignee email\")),\n" +
        "  dryRun: Flag.Boolean(\"dry-run\").pipe(Flag.withDefault(false))\n" +
        "}, Effect.fn(\"create\")(function*({ title, priority, assignee, dryRun }) {\n" +
        "  yield* Effect.log(`Created \"${title}\" with ${priority} priority`)\n" +
        "})).pipe(Command.withDescription(\"Create a task\"))"
    )
  })

  it("parses argv into typed parameters", async () => {
    const mod = await runCompiled(`
      import { Effect, Option } from "effect"
      import { Command } from "effect/cli"
      import { NodeServices } from "@effect/platform-node"
      export const seen: Array<unknown> = []
      command create(
        title: string,
        --priority: "low" | "normal" | "high" = "normal",
        /** @alias a */ --assignee?: string,
        --dryRun: boolean = false
      ) {
        seen.push({ title, priority, assignee: Option.getOrNull(assignee), dryRun })
      }
      await Effect.runPromise(
        Command.runWith(create, { version: "1.0.0" })(["--priority", "high", "-a", "ada", "--dry-run", "Write docs"])
          .pipe(Effect.provide(NodeServices.layer))
      )
    `)
    expect(mod.seen).toEqual([{ title: "Write docs", priority: "high", assignee: "ada", dryRun: true }])
  }, 180_000)

  it("takes the command description from its own doc comment only", () => {
    const { code } = toTypeScript(
      "/** Unrelated */\nconst x = 1\n\n/** Real */\ncommand go() {\n  return\n}\ncommand bare() {\n  return\n}\n"
    )
    expect(code).toContain(".pipe(Command.withDescription(\"Real\"))")
    expect(code).not.toContain("Unrelated\"")
    expect(code).toContain("const bare = Command.make(\"bare\", {}, Effect.fn(\"bare\")(function*() {\n  return\n}))\n")
  })
})
