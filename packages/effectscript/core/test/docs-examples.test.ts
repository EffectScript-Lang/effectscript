import { Data, Effect } from "effect"
import { parseDocComment } from "effectscript/docs/comment"
import { rewriteExample } from "effectscript/docs/examples"
import { assertDoc, dies, failsWith } from "effectscript/doctest"
import { describe, expect, it } from "vitest"

const example = (code: string) => {
  const source = `/**\n * \`\`\`efx\n${code.split("\n").map((l) => ` * ${l}`).join("\n")}\n * \`\`\`\n */`
  return { source, example: parseDocComment(source, 0, source.length).examples[0]! }
}
const rewrite = (code: string) => {
  const { example: e, source } = example(code)
  const r = rewriteExample(e)
  return {
    lines: r.lines,
    codes: r.diagnostics.map((d) => d.code),
    at: r.diagnostics.map((d) => source.slice(d.start, d.end))
  }
}

describe("rewriteExample", () => {
  it("wraps expression statements", () => {
    expect(rewrite("f(1) // => 2").lines).toEqual(["$efxDoctest.assertDoc(f(1), (2)) // => 2"])
    expect(rewrite("await g() // => { a: 1 }").lines).toEqual([
      "$efxDoctest.assertDoc(await g(), ({ a: 1 })) // => { a: 1 }"
    ])
  })

  it("checks a const after it is declared", () => {
    expect(rewrite("const x = await g() // => 3").lines).toEqual([
      "const x = await g(); $efxDoctest.assertDoc(x, (3)) // => 3"
    ])
  })

  it("asserts defects", () => {
    expect(rewrite("await boom() // => dies").lines).toEqual(["await $efxDoctest.dies(boom()) // => dies"])
    expect(rewrite("boom() // => dies").codes).toEqual(["EFX9303"])
  })

  it("asserts failures by tag", () => {
    expect(rewrite("await pay(9999) // => throws InsufficientFunds").lines).toEqual([
      "await $efxDoctest.failsWith(pay(9999), \"InsufficientFunds\") // => throws InsufficientFunds"
    ])
  })

  it("keeps the line count for multi-line statements", () => {
    expect(rewrite("f(\n  1\n) // => 1\nconst y = 2").lines).toEqual([
      "$efxDoctest.assertDoc(f(",
      "  1",
      "), (1)) // => 1",
      "const y = 2"
    ])
  })

  it("reports misplaced assertions with source positions", () => {
    expect(rewrite("// => 1").codes).toEqual(["EFX9302"])
    expect(rewrite("let a = 1, b = 2 // => 1").codes).toEqual(["EFX9302"])
    expect(rewrite("f() // => throws X").codes).toEqual(["EFX9303"])
    expect(rewrite("await f() // => throws not-a-name").codes).toEqual(["EFX9303"])
    expect(rewrite("const = 1").codes).toEqual(["EFX9301"])
    expect(rewrite("x // =>").at).toEqual(["// =>"])
  })
})

class Boom extends Data.TaggedError("Boom")<{}> {}

describe("effectscript/doctest", () => {
  it("assertDoc compares with Equal, then structurally", () => {
    expect(() => assertDoc({ a: [1] }, { a: [1] })).not.toThrow()
    expect(() => assertDoc(1, 2)).toThrow(/Expected values to be strictly deep-equal/)
  })

  it("failsWith checks the failure tag", async () => {
    await Effect.runPromise(failsWith(Effect.fail(new Boom()), "Boom"))
    await expect(Effect.runPromise(failsWith(Effect.succeed(1), "Boom"))).rejects.toThrow(/succeeded/)
    await expect(Effect.runPromise(failsWith(Effect.fail(new Boom()), "Other"))).rejects.toThrow(/failed with Boom/)
    await expect(Effect.runPromise(failsWith(Effect.die("x"), "Boom"))).rejects.toThrow(/died/)
  })

  it("dies checks for a defect", async () => {
    await Effect.runPromise(dies(Effect.die("x")))
    await expect(Effect.runPromise(dies(Effect.fail(new Boom())))).rejects.toThrow(/failed with Boom/)
    await expect(Effect.runPromise(dies(Effect.succeed(1)))).rejects.toThrow(/succeeded/)
  })
})
