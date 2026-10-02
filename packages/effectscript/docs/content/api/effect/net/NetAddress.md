# effect/net/NetAddress

The examples in the JSDoc of `packages/effect/src/net/NetAddress.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Family

**Deriving the family of an internet address**

```efx
import { NetAddress } from "effect/net"

const family: NetAddress.Family<NetAddress.InetAddressV6> = NetAddress.ipv6Loopback
```

## Inet

**Selecting the internet address for a family**

```efx
import { Result } from "effect"
import { NetAddress } from "effect/net"

const endpoint: NetAddress.Inet<NetAddress.Ipv4Address> = Result.getOrThrow(
  NetAddress.inetAddressV4(NetAddress.ipv4Loopback, 8080)
)
```

## MulticastInterface

**Selecting multicast interfaces by family**

```efx
import { NetAddress } from "effect/net"

const ipv4Interface: NetAddress.MulticastInterface<NetAddress.Ipv4Address> =
  NetAddress.ipv4Unspecified
const ipv6Interface: NetAddress.MulticastInterface<NetAddress.Ipv6Address> = 0
```

## isMulticast

**Classifying IP and MAC group addresses**

```efx
import { assert } from "@effect/vitest"
import { NetAddress } from "effect/net"

const ip = NetAddress.ipFromStringUnsafe("239.255.0.1")
const mac = NetAddress.macAddressFromStringUnsafe("ff:ff:ff:ff:ff:ff")

assert.isTrue(NetAddress.isMulticast(ip))
assert.isTrue(NetAddress.isMulticast(mac))
assert.isTrue(NetAddress.isBroadcast(mac))
assert.isFalse(NetAddress.isMulticast(NetAddress.ipv4Broadcast))
```
