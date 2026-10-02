export interface User {
  readonly id: string
  readonly name: string
}

export interface Database {
  query(sql: string): Promise<ReadonlyArray<User>>
}

// Dependencies are threaded by hand, and nothing checks that they are provided
export class Users {
  constructor(private readonly db: Database) {}

  all(): Promise<ReadonlyArray<User>> {
    return this.db.query("select * from users")
  }
}

export async function names(users: Users): Promise<ReadonlyArray<string>> {
  const all = await users.all()
  return all.map((u) => u.name)
}

export const testDatabase: Database = {
  query: async () => [{ id: "1", name: "Ada" }]
}
