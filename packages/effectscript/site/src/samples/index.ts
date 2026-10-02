/** The gallery's scenarios (spec §9.2), in display order. */
export const scenarios = [
  { id: "errors", title: "Typed errors and retries", file: "users" },
  { id: "services", title: "Services and layers", file: "users" },
  { id: "schemas", title: "Schemas and decoding", file: "signup" },
  { id: "concurrency", title: "Concurrency", file: "profile" },
  { id: "resources", title: "Resources", file: "upload" },
  { id: "matching", title: "Pattern matching", file: "shapes" },
  { id: "http", title: "HTTP APIs", file: "todos" },
  { id: "cli", title: "CLIs", file: "create" },
  { id: "testing", title: "Tests", file: "users.test" },
  { id: "config", title: "Configuration", file: "config" }
] as const
