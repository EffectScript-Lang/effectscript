declare const openFile: (path: string) => Promise<{ read(): Promise<string>; close(): Promise<void> }>
declare const connect: (url: string) => Promise<{ send(text: string): Promise<void>; close(): Promise<void> }>

// Every resource needs its own try/finally, nested in reverse order
export async function upload(path: string, url: string) {
  const file = await openFile(path)
  try {
    const socket = await connect(url)
    try {
      await socket.send(await file.read())
    } finally {
      await socket.close()
    }
  } finally {
    await file.close()
  }
}
