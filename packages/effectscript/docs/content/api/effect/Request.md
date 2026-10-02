# effect/Request

The examples in the JSDoc of `packages/effect/src/Request.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Request

**Defining typed requests**

```efx
import type { Request } from "effect"

// Define a request that fetches a user by ID
interface GetUser extends Request.Request<string, Error> {
  readonly _tag: "GetUser"
  readonly id: number
}

// Define a request that fetches all users
interface GetAllUsers extends Request.Request<ReadonlyArray<string>, Error> {
  readonly _tag: "GetAllUsers"
}

```

## Constructor

**Using generated request constructors**

```efx
import { Request } from "effect"

interface GetUser extends Request.Request<string, Error> {
  readonly _tag: "GetUser"
  readonly id: number
}

// Constructor type is used internally by Request.of() and Request.tagged()
const GetUser = Request.tagged<GetUser>("GetUser")
const request = GetUser({ id: 123 })

request._tag // => "GetUser"
request.id // => 123
```

## Error

**Extracting a request error type**

```efx
import type { Request } from "effect"

interface GetUser extends Request.Request<string, Error> {
  readonly id: number
}

// Extract the error type from a Request using the utility
type UserError = Request.Error<GetUser> // Error

```

## Success

**Extracting a request success type**

```efx
import type { Request } from "effect"

interface GetUser extends Request.Request<string, Error> {
  readonly _tag: "GetUser"
  readonly id: number
}

// Extract the success type from a Request using the utility
type UserSuccess = Request.Success<GetUser> // string

```

## Result

**Extracting a request result type**

```efx
import type { Request } from "effect"

interface GetUser extends Request.Request<string, Error> {
  readonly _tag: "GetUser"
  readonly id: number
}

// Extract the result type from a Request using the utility
type UserResult = Request.Result<GetUser> // Exit.Exit<string, Error>

```

## isRequest

**Checking request values**

```efx
import { Request } from "effect"

declare const User: unique symbol
declare const UserNotFound: unique symbol
type User = typeof User
type UserNotFound = typeof UserNotFound

interface GetUser extends Request.Request<User, UserNotFound> {
  readonly _tag: "GetUser"
  readonly id: string
}
const GetUser = Request.tagged<GetUser>("GetUser")

const request = GetUser({ id: "123" })
Request.isRequest(request) // => true
Request.isRequest("not a request") // => false
```

## of

**Creating untagged request constructors**

```efx
import { Request } from "effect"

declare const UserProfile: unique symbol
declare const ProfileError: unique symbol
type UserProfile = typeof UserProfile
type ProfileError = typeof ProfileError

interface GetUserProfile extends Request.Request<UserProfile, ProfileError> {
  readonly id: string
  readonly includeSettings: boolean
}

const GetUserProfile = Request.of<GetUserProfile>()

const request = GetUserProfile({
  id: "user-123",
  includeSettings: true
})

request.id // => "user-123"
request.includeSettings // => true
```

## tagged

**Creating tagged request constructors**

```efx
import { Request } from "effect"

declare const User: unique symbol
declare const UserNotFound: unique symbol
declare const Post: unique symbol
declare const PostNotFound: unique symbol
type User = typeof User
type UserNotFound = typeof UserNotFound
type Post = typeof Post
type PostNotFound = typeof PostNotFound

interface GetUser extends Request.Request<User, UserNotFound> {
  readonly _tag: "GetUser"
  readonly id: string
}

interface GetPost extends Request.Request<Post, PostNotFound> {
  readonly _tag: "GetPost"
  readonly id: string
}

const GetUser = Request.tagged<GetUser>("GetUser")
const GetPost = Request.tagged<GetPost>("GetPost")

const userRequest = GetUser({ id: "user-123" })
const postRequest = GetPost({ id: "post-456" })

// _tag is automatically set
Array.of(userRequest._tag, postRequest._tag) // => ["GetUser", "GetPost"]
```

## Class

**Defining request classes**

```efx
import { Request } from "effect"

class GetUser extends Request.Class<{ id: number }, string, Error> {
  constructor(readonly id: number) {
    super({ id })
  }
}

const getUserRequest = new GetUser(123)
getUserRequest.id // => 123
```

## TaggedClass

**Defining tagged request classes**

```efx
import { Request } from "effect"

class GetUserById
  extends Request.TaggedClass("GetUserById")<{ id: number }, string, Error>
{}

const request = new GetUserById({ id: 123 })

request._tag // => "GetUserById"
request.id // => 123
```
