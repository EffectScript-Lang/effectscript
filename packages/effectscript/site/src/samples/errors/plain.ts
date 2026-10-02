export class UserNotFound extends Error {
  constructor(readonly id: string) {
    super(`User ${id} not found`)
  }
}

export interface User {
  readonly id: string
  readonly name: string
}

declare const fetchUser: (id: string, signal: AbortSignal) => Promise<User>

// Errors are invisible in the type: callers can't tell UserNotFound from a timeout
export async function loadUser(id: string): Promise<User> {
  for (let attempt = 1;; attempt++) {
    try {
      return await fetchUser(id, AbortSignal.timeout(2000))
    } catch (error) {
      if (error instanceof UserNotFound) throw error
      if (attempt === 3) {
        console.warn("gave up after 3 timeouts")
        return { id, name: "guest" }
      }
    }
  }
}
