export type Email = string & { readonly __brand: "Email" }

export interface Signup {
  readonly email: Email
  readonly name: string
  readonly age: number
  readonly plan: "free" | "pro"
}

// The type and its validation are written twice, and can drift apart
export function parseSignup(body: unknown): Signup {
  const value = body as Record<string, unknown>
  if (typeof value.email !== "string") throw new Error("email: expected a string")
  if (typeof value.name !== "string") throw new Error("name: expected a string")
  if (typeof value.age !== "number" || !Number.isInteger(value.age) || value.age <= 17) {
    throw new Error("age: expected an integer over 17")
  }
  if (value.plan !== "free" && value.plan !== "pro") throw new Error("plan: expected free or pro")
  return { email: value.email as Email, name: value.name, age: value.age, plan: value.plan }
}

export function register(body: unknown): Signup {
  const signup = parseSignup(body)
  console.log(`welcome, ${signup.name}`)
  return signup
}
