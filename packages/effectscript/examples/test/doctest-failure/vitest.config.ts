import { efx } from "effectscript/vite"
import { defineConfig } from "vitest/config"

// run only by ../doctest-failure.test.ts: a doctest that must fail at its doc-comment line
export default defineConfig({
  plugins: [efx()],
  test: { include: ["*.check.efx"] }
})
