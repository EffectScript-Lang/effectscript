/// <reference lib="webworker" />
/** The compiler, off the main thread: a huge paste or a slow compile never freezes the page. */
import { compile, type Request } from "./protocol.ts"

self.onmessage = (event: MessageEvent<Request>) => {
  self.postMessage(compile(event.data))
}
