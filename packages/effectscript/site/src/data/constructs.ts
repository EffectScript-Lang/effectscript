/** The library constructs section's cards (spec §9.2 item 6). Each snippet compiles (a test). */
export const constructs = [
  {
    name: "test / describe",
    what: "Effect tests on @effect/vitest, with layers per suite.",
    code:
      "describe \"Users\" with Users.layerTest {\n  test \"finds a user\" {\n    expect(await Users.find(\"1\")).toBe(\"user-1\")\n  }\n}"
  },
  {
    name: "api / group / impl",
    what: "Schema-first HTTP APIs with typed handlers and clients.",
    code: "export group TodosApi {\n  get byId \"/:id\" (params: { id: string }): Todo throws TodoNotFound\n}"
  },
  {
    name: "command",
    what: "CLIs on effect/cli: arguments, flags and help from the signature.",
    code:
      "/** Create a task */\nexport command create(title: string, --priority: \"low\" | \"high\" = \"low\") {\n  console.log(title)\n}"
  },
  {
    name: "config",
    what: "Typed configuration from the environment, with defaults and secrets.",
    code: "export config AppConfig {\n  port: Port = 3000\n  databaseUrl: Redacted\n}"
  },
  {
    name: "layer",
    what: "Wiring as values: merge with &, provide with |>.",
    code: "export layer AppLive = Users.layer & Posts.layer\n  |> provide(Database.layer)"
  },
  {
    name: "main",
    what: "One entry point that provides the layers, with zero-config OpenTelemetry when you want it.",
    code: "main {\n  const greeting = await Greeter.greet(\"Ada\")\n  console.log(greeting)\n} |> provide(AppLive)"
  }
] as const
