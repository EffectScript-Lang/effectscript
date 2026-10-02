import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const codes = (source: string, options: Parameters<typeof toTypeScript>[1] = {}) =>
  toTypeScript(source, options).diagnostics.map((d) => d.code)

describe("strict errors (§4.17, ADR-0028)", () => {
  it.each([
    ["EFX8001", "effect g() {\n  return 1\n}\neffect f() {\n  g()\n}\n"],
    ["EFX8001", "effect f() {\n  sleep(\"1 second\")\n}\n"],
    ["EFX8001", "import { Effect } from \"effect\"\neffect f() {\n  Effect.log(\"x\")\n}\n"],
    [
      "EFX8003",
      "import { Effect } from \"effect\"\neffect f(x: Effect.Effect<number>) {\n  return Effect.runSync(x)\n}\n"
    ],
    ["EFX8004", "effect f() {\n  throw \"boom\"\n}\n"],
    ["EFX8004", "effect f(n: number) {\n  return n > 0 ? n : throw `bad ${n}`\n}\n"],
    [
      "EFX8005",
      "effect f(x: Effect.Effect<number>) {\n  try {\n    return await x\n  } catch (e: any) {\n    return 0\n  }\n}\n"
    ],
    ["EFX8111", "effect f() {\n  return await fetch(\"https://example.com\")\n}\n"],
    ["EFX8111", "effect f() {\n  return await new Promise((resolve) => resolve(1))\n}\n"],
    ["EFX8111", "effect f(p: Promise<number>) {\n  return await p.then((x) => x)\n}\n"],
    ["EFX8111", "async function load() {\n  return 1\n}\neffect f() {\n  return await load()\n}\n"],
    ["EFX8111", "effect f() {\n  return await Promise.all([1])\n}\n"]
  ])("%s: %j", (code, source) => {
    expect(codes(source)).toContain(code)
  })

  it.each([
    "import { Effect } from \"effect\"\neffect f(x: unknown) {\n  Effect.isEffect(x)\n}\n",
    "effect f() {\n  await log(\"x\")\n}\n",
    "effect f() {\n  const g = () => 1\n  g()\n}\n",
    "function plain() {\n  throw \"x\"\n}\n",
    "effect f(x: Effect.Effect<number>) {\n  return await x\n}\n"
  ])("no strict error: %j", (source) => {
    expect(codes(source).filter((c) => c.startsWith("EFX80") || c === "EFX8111")).toEqual([])
  })

  it("EFX8002: yield inside effect code is already a syntax error", () => {
    expect(codes("effect f() {\n  yield 1\n}\n")).toEqual(["EFX1001"])
  })
})

describe("strict-mode regressions", () => {
  it("effect declarations are not mistaken for async functions (EFX8111)", () => {
    expect(codes("effect get() {\n  return 1\n}\neffect f() {\n  return await get()\n}\n")).toEqual([])
    expect(codes("const g = effect () => 1\neffect f() {\n  return await g()\n}\n")).toEqual([])
  })
})

describe("strict warnings (§4.17, ADR-0028)", () => {
  const warnings = (source: string) =>
    toTypeScript(source).diagnostics.filter((d) => d.severity === "warning").map((d) => d.code)

  it.each([
    ["EFX8112", "effect f(xs: Array<Effect.Effect<number>>) {\n  return await xs.map((x) => x)\n}\n"],
    [
      "EFX8112",
      "effect f(ids: Array<string>, load: (id: string) => Effect.Effect<number>) {\n  const all = await ids.map(load)\n  return all\n}\n"
    ],
    ["EFX8101", "import { Effect } from \"effect\"\nexport const g = Effect.gen(function*() {\n  return 1\n})\n"],
    ["EFX8102", "effect f() {\n  const load = async () => 1\n  return load\n}\n"],
    ["EFX8103", "effect f() {\n  throw new Error(\"boom\")\n}\n"],
    ["EFX8104", "export const a: any = 1\n"],
    ["EFX8105", "effect f() {\n  setTimeout(() => {}, 10)\n}\n"],
    ["EFX8106", "effect f() {\n  const p = fetch(\"https://example.com\")\n  return p\n}\n"],
    ["EFX8107", "effect f() {\n  const p = Promise.all([])\n  return p\n}\n"],
    ["EFX8108", "effect f(s: string) {\n  return JSON.parse(s)\n}\n"],
    ["EFX8109", "effect f() {\n  return new Date()\n}\n"],
    ["EFX8110", "service S {\n  effect find(id: string): string | undefined\n}\n"]
  ])("%s: %j", (code, source) => {
    expect(warnings(source)).toContain(code)
  })

  it("rules scoped to effect code stay quiet in plain functions", () => {
    expect(
      warnings("export function f(s: string) {\n  setTimeout(() => {}, 1)\n  return JSON.parse(s) as unknown\n}\n")
    ).toEqual([])
  })

  it("strict promotes warnings to errors without changing output", () => {
    const source = "export const a: any = 1\n"
    const relaxed = toTypeScript(source)
    const strict = toTypeScript(source, { strict: true })
    expect(strict.diagnostics.map((d) => `${d.code}:${d.severity}`)).toEqual(["EFX8104:error"])
    expect(strict.code).toBe(relaxed.code)
  })
})
