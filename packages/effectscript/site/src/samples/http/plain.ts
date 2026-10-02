import { createServer } from "node:http"

interface Todo {
  readonly id: string
  readonly title: string
}

const todos = new Map<string, Todo>([["1", { id: "1", title: "Write docs" }]])

// Routing, status codes and JSON by hand; no schema, no typed client
export const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost")
  const match = /^\/todos\/([^/]+)$/.exec(url.pathname)
  if (req.method === "GET" && url.pathname === "/todos") {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify([...todos.values()]))
  }
  if (req.method === "GET" && match !== null) {
    const todo = todos.get(match[1]!)
    res.writeHead(todo ? 200 : 404, { "content-type": "application/json" })
    return res.end(JSON.stringify(todo ?? { error: "TodoNotFound", id: match[1] }))
  }
  res.writeHead(404).end()
})
