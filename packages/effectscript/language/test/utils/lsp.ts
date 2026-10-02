import { type ChildProcess, spawn } from "node:child_process"

/**
 * A minimal LSP client over stdio: requests, notifications, and replies (null) to the server's
 * own requests (`client/registerCapability`, `workspace/configuration`, …).
 */
export const startLsp = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv }
) => {
  const child: ChildProcess = spawn(command, [...args], { cwd: options.cwd, env: options.env ?? process.env })
  let buffer = Buffer.alloc(0)
  let id = 0
  const pending = new Map<number, (message: any) => void>()
  const notifications: Array<{ method: string; params: any }> = []
  const listeners: Array<() => void> = []
  let stderr = ""
  child.stderr!.on("data", (chunk) => (stderr += chunk))
  let exited: Error | undefined
  child.on("exit", (code) => {
    exited = new Error(`the language server exited (${code}): ${stderr}`)
    for (const [, reply] of pending) reply({ error: exited.message })
    pending.clear()
  })
  const write = (message: object) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }))
    child.stdin!.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]))
  }
  child.stdout!.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n")
      if (headerEnd === -1) return
      const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())![1])
      if (buffer.length < headerEnd + 4 + length) return
      const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString())
      buffer = buffer.subarray(headerEnd + 4 + length)
      if (message.id !== undefined && message.method !== undefined) {
        write({
          id: message.id,
          result: message.method === "workspace/configuration" ? message.params.items.map(() => null) : null
        })
      } else if (message.id !== undefined) {
        pending.get(message.id)?.(message)
        pending.delete(message.id)
      } else {
        notifications.push(message)
        for (const listener of listeners.splice(0)) listener()
      }
    }
  })
  return {
    request: (method: string, params: unknown): Promise<any> =>
      new Promise((resolve, reject) => {
        if (exited !== undefined) return reject(exited)
        const current = ++id
        pending.set(
          current,
          (message) => (message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result))
        )
        write({ id: current, method, params })
      }),
    notify: (method: string, params: unknown) => write({ method, params }),
    /** Waits for a notification matching `predicate`. */
    waitFor: (
      predicate: (n: { method: string; params: any }) => boolean,
      timeout = 60_000
    ): Promise<{ method: string; params: any }> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out; stderr: ${stderr}`)), timeout)
        const check = () => {
          const found = notifications.find(predicate)
          if (found !== undefined) {
            clearTimeout(timer)
            resolve(found)
          } else listeners.push(check)
        }
        check()
      }),
    notifications,
    stderr: () => stderr,
    close: () => child.kill()
  }
}

/** LSP position (0-based line and UTF-16 character) of `index` in `text`. */
export const position = (text: string, index: number) => {
  const before = text.slice(0, index).split("\n")
  return { line: before.length - 1, character: before[before.length - 1]!.length }
}
