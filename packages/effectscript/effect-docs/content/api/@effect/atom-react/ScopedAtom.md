# @effect/atom-react/ScopedAtom

The examples in the JSDoc of `packages/atom/react/src/ScopedAtom.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## ScopedAtom

**Providing and reading a scoped atom**

```efx
import { make, useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const Counter = make(() => Atom.make(0))

function View() {
  const atom = Counter.use()
  const value = useAtomValue(atom)
  return React.createElement("div", null, value)
}

export function App() {
  return React.createElement(Counter.Provider, null, React.createElement(View))
}

renderToStaticMarkup(React.createElement(App)) // => "<div>0</div>"
```

## make

**Creating a scoped atom with input**

```efx
import { make, useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const User = make((name: string) => Atom.make(name))

function UserName() {
  const atom = User.use()
  const value = useAtomValue(atom)
  return React.createElement("span", null, value)
}

export function App() {
  return React.createElement(
    User.Provider,
    { value: "Ada" },
    React.createElement(UserName)
  )
}

renderToStaticMarkup(React.createElement(App)) // => "<span>Ada</span>"
```
