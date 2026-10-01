import {
  bareTypes,
  effectExports,
  excludedNames,
  preludeModules,
  serviceTags
} from "effectscript/compiler/prelude/tables"
import { describe, expect, it } from "vitest"

describe("prelude tables", () => {
  it("contains core and subpath modules but no JS globals", () => {
    for (const name of ["Effect", "Schema", "Layer", "Option", "Console", "FileSystem", "Stream", "Match", "Data"]) {
      expect(preludeModules.get(name)).toBe("effect")
    }
    expect(preludeModules.get("HttpClient")).toBe("effect/http")
    expect(preludeModules.get("HttpApi")).toBe("effect/http-api")
    expect(preludeModules.get("Command")).toBe("effect/cli")
    expect(preludeModules.get("Atom")).toBe("effect/reactivity")
    for (const name of ["Array", "String", "Number", "Record", "Iterable", "Request"]) {
      expect(preludeModules.has(name)).toBe(false)
    }
  })

  it("knows builtins, bare types and service tags", () => {
    for (const name of ["retry", "timeout", "succeed", "fail", "all", "sleep", "gen", "fn", "orDie"]) {
      expect(effectExports.has(name)).toBe(true)
    }
    for (const name of ["void", "catch", "if", "try"]) expect(effectExports.has(name)).toBe(false)
    for (const name of ["Effect", "Option", "Stream", "Layer", "Exit"]) expect(bareTypes.has(name)).toBe(true)
    for (const name of ["FileSystem", "Path"]) expect(serviceTags.has(name)).toBe(true)
    for (const name of ["fetch", "Promise", "setTimeout", "process", "console"]) {
      expect(excludedNames.has(name)).toBe(true)
    }
  })
})
