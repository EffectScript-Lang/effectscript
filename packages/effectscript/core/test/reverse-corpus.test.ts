import { toEffectScript, toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { tokensAndComments } from "./utils/tokens.ts"

const corpus = path.resolve(import.meta.dirname, "../../../../ai-docs/src")

// ADR-0030 on hand-written Effect code: conversion never breaks a file, and without a
// canonicalization it compiles back to the same tokens and the same comments, in order.
describe("reverse corpus (ai-docs)", () => {
  it("converts every file to EffectScript that compiles back to equivalent code", () => {
    const failures: Array<string> = []
    let count = 0
    for (const file of fs.readdirSync(corpus, { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith(".ts")) continue
      count++
      const source = fs.readFileSync(path.join(corpus, file), "utf8")
      const options = { filename: file }
      const back = toEffectScript(source, options)
      const again = toTypeScript(back.code, options)
      const errors = again.diagnostics.filter((d) => d.severity === "error")
      if (errors.length > 0) failures.push(`${file}: ${errors[0]!.code} ${errors[0]!.message}`)
      else if (!back.notes.some((n) => n.message.startsWith("canonicalized:"))) {
        const before = tokensAndComments(source)
        const after = tokensAndComments(again.code)
        if (before.tokens.join(" ") !== after.tokens.join(" ")) failures.push(`${file}: tokens differ`)
        else if (before.comments.join("\n") !== after.comments.join("\n")) failures.push(`${file}: comments differ`)
      }
    }
    expect(count).toBeGreaterThan(40)
    expect(failures).toEqual([])
  }, 120_000)
})
