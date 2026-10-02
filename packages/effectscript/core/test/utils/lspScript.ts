import { spawn, type SpawnOptions } from "node:child_process"
import * as path from "node:path"
import { pathToFileURL } from "node:url"

const frame = (message: object) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }))
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body])
}

/**
 * Runs a language server through one session (initialize, open `file`, hover at `offset`,
 * shutdown, exit), waiting for each reply, and returns the replies by id (1: initialize, 2: hover),
 * the logged messages, the exit status and stderr.
 */
export const lspSession = (
  command: string,
  args: ReadonlyArray<string>,
  options:
    & { readonly dir: string; readonly file: string; readonly text: string; readonly offset: number }
    & SpawnOptions
): Promise<{ status: number | null; stderr: string; replies: Map<number, any>; logs: Array<string> }> =>
  new Promise((resolve) => {
    const child = spawn(command, [...args], { ...options, cwd: options.dir, stdio: "pipe" })
    const uri = pathToFileURL(path.join(options.dir, options.file)).href
    const before = options.text.slice(0, options.offset).split("\n")
    const replies = new Map<number, any>()
    const logs: Array<string> = []
    let stderr = ""
    let buffer = Buffer.alloc(0)
    const send = (message: object) => child.stdin!.write(frame(message))
    const timer = setTimeout(() => child.kill(), 120_000)
    child.stderr!.on("data", (chunk) => (stderr += chunk))
    child.stdout!.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      for (;;) {
        const headerEnd = buffer.indexOf("\r\n\r\n")
        if (headerEnd === -1) return
        const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())![1])
        if (buffer.length < headerEnd + 4 + length) return
        const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString())
        buffer = buffer.subarray(headerEnd + 4 + length)
        if (message.method === "window/logMessage") logs.push(message.params.message)
        if (message.id !== undefined && message.method !== undefined) send({ id: message.id, result: null })
        if (message.id === undefined || message.method !== undefined) continue
        replies.set(message.id, message)
        if (message.id === 1) {
          send({ method: "initialized", params: {} })
          send({
            method: "textDocument/didOpen",
            params: { textDocument: { uri, languageId: "effectscript", version: 1, text: options.text } }
          })
          send({
            id: 2,
            method: "textDocument/hover",
            params: { textDocument: { uri }, position: { line: before.length - 1, character: before.at(-1)!.length } }
          })
        } else if (message.id === 2) {
          send({ id: 3, method: "shutdown" })
        } else if (message.id === 3) {
          send({ method: "exit" })
        }
      }
    })
    child.on("exit", (status) => {
      clearTimeout(timer)
      resolve({ status, stderr, replies, logs })
    })
    send({
      id: 1,
      method: "initialize",
      params: { processId: null, rootUri: pathToFileURL(options.dir).href, capabilities: {} }
    })
  })
