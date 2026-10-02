import { efx } from "effectscript/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [efx()],
  test: { include: ["test/**/*.test.{ts,efx}"] }
})
