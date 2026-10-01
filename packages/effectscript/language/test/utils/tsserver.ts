import { type ChildProcess, spawn } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** A real TypeScript 6 tsserver process speaking the JSON protocol over stdio. */
export const startTsserver = (options: { readonly probeLocation: string; readonly cwd: string }) => {
  const tsserver = require.resolve("typescript/lib/tsserver.js")
  const child: ChildProcess = spawn(process.execPath, [
    tsserver,
    "--disableAutomaticTypingAcquisition",
    "--globalPlugins",
    "@effectscript/language",
    "--pluginProbeLocations",
    options.probeLocation
  ], { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] })
  let buffer = ""
  let seq = 0
  const pending = new Map<number, (body: any) => void>()
  child.stdout!.setEncoding("utf8")
  child.stdout!.on("data", (chunk: string) => {
    buffer += chunk
    for (;;) {
      const header = /Content-Length: (\d+)\r\n\r\n/.exec(buffer)
      if (header === null) return
      const start = header.index + header[0].length
      const length = Number(header[1])
      if (Buffer.byteLength(buffer.slice(start)) < length) return
      const bytes = Buffer.from(buffer.slice(start))
      const json = bytes.subarray(0, length).toString("utf8")
      buffer = bytes.subarray(length).toString("utf8")
      const message = JSON.parse(json)
      if (message.type === "response") pending.get(message.request_seq)?.(message)
    }
  })
  const send = (command: string, args: unknown, expectResponse = true): Promise<any> =>
    new Promise((resolve) => {
      const id = ++seq
      if (expectResponse) pending.set(id, resolve)
      child.stdin!.write(`${JSON.stringify({ seq: id, type: "request", command, arguments: args })}\n`)
      if (!expectResponse) resolve(undefined)
    })
  return { send, close: () => child.kill() }
}
