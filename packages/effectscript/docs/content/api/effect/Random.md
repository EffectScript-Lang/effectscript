# effect/Random

The examples in the JSDoc of `packages/effect/src/Random.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Random

**Accessing the random service**

```efx

const program = effect {
  const float = Math.random()
  const integer = await Random.nextInt
  const inRange = await Random.nextIntBetween(1, 100)
  return [float, integer, inRange] as const
}

await runPromise(program.pipe(Random.withSeed("example"))) // => [0.1633802591287037, 3434461687501127, 1]
```

## next

**Generating a random number**

```efx

await runPromise(Random.next.pipe(Random.withSeed("example"))) // => 0.1633802591287037
```

## nextBoolean

**Generating a random boolean**

```efx

await runPromise(Random.nextBoolean.pipe(Random.withSeed("example"))) // => false
```

## nextInt

**Generating a random integer**

```efx

await runPromise(Random.nextInt.pipe(Random.withSeed("example"))) // => -6064002158214091
```

## nextBetween

**Generating a bounded random number**

```efx

await runPromise(Random.nextBetween(0, 1).pipe(Random.withSeed("example"))) // => 0.1633802591287037
```

## nextIntBetween

**Generating a bounded random integer**

```efx

const program = effect {
  const diceRoll1 = await Random.nextIntBetween(1, 6)
  const diceRoll2 = await Random.nextIntBetween(1, 6, {
    halfOpen: true
  })
  const diceRoll3 = await Random.nextIntBetween(0, 10)
  return [diceRoll1, diceRoll2, diceRoll3]
}

await runPromise(program.pipe(Random.withSeed("example"))) // => [1, 4, 0]
```

## shuffle

**Shuffling values**

```efx

await runPromise(Random.shuffle([1, 2, 3, 4, 5]).pipe(Random.withSeed("example"))) // => [4, 2, 5, 3, 1]
```

## choice

**Choosing a random value**

```efx

await runPromise(Random.choice(["red", "green", "blue"] as const).pipe(Random.withSeed("example"))) // => "red"
```

## withSeed

**Seeding random generation**

```efx

const program = effect {
  const value1 = Math.random()
  const value2 = Math.random()
  return [value1, value2]
}

await runPromise(all([
  program.pipe(Random.withSeed("my-seed")),
  program.pipe(Random.withSeed("my-seed"))
])) // => [[0.018368576514773527, 0.4010840628128671], [0.018368576514773527, 0.4010840628128671]]
```
