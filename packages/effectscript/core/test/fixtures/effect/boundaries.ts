import { Effect } from "effect"
const outer = Effect.fn("outer")(function*() {
  const plain = [1, 2].map((n) => n + 1)
  const promise = async () => {
    await Promise.resolve(1)
  }
  function named() {
    throw new Error("still JS")
  }
  return { plain, promise, named }
})

const notEffect = async () => await Promise.resolve(2)
