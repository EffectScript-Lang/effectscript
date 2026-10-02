import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const hasBun = spawnSync("bun", ["--version"]).status === 0
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "efx-runtime-"))
const inside = fs.mkdtempSync(path.join(import.meta.dirname, "../.efx-runtime-"))
for (const dir of [outside, inside]) {
  fs.writeFileSync(
    path.join(dir, "which.ts"),
    "console.log(typeof Bun === \"undefined\" ? \"node\" : \"bun\", process.argv.slice(2).join(\" \"))\n"
  )
}
const run = (dir: string, args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [efx, "run", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })

afterAll(() => {
  for (const dir of [outside, inside]) fs.rmSync(dir, { recursive: true, force: true })
})

describe("efx run --runtime (Plan 9 Task 2, ADR-0034)", () => {
  it("uses Node with --runtime node, passing arguments through", () => {
    expect(run(inside, ["--runtime", "node", "which.ts", "--port", "1"]).stdout.trim()).toBe("node --port 1")
  })

  it("stays on Node without @effect/platform-bun, even with Bun installed", () => {
    expect(run(outside, ["which.ts"]).stdout.trim()).toBe("node")
  })

  it.skipIf(!hasBun)("uses Bun with --runtime bun", () => {
    expect(run(inside, ["--runtime", "bun", "which.ts", "x"]).stdout.trim()).toBe("bun x")
  })

  it.skipIf(!hasBun)("picks Bun when the project has @effect/platform-bun", () => {
    // this package depends on @effect/platform-bun (dev), so `inside` resolves it
    expect(run(inside, ["which.ts"]).stdout.trim()).toBe("bun")
  })
})
