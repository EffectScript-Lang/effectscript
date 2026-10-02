import { expect, test } from "bun:test"
import { Effect } from "effect"
import { greeting, Users } from "../src/users.efx"

test("greets on Bun", async () => {
  const text = await Effect.runPromise(greeting("2").pipe(Effect.provide(Users.layer)))
  expect(text).toBe("Hello, Grace!")
})
