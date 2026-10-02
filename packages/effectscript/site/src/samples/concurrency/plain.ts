declare const loadUser: (id: string) => Promise<string>
declare const loadPosts: (id: string) => Promise<ReadonlyArray<string>>
declare const loadAvatar: (id: string, signal: AbortSignal) => Promise<Uint8Array>

export async function profile(id: string) {
  const [user, posts] = await Promise.all([loadUser(id), loadPosts(id)])
  let avatar: Uint8Array | undefined
  try {
    avatar = await loadAvatar(id, AbortSignal.timeout(500))
  } catch {
    avatar = undefined
  }
  return { user, posts, avatar }
}

// A hand-rolled pool: at most 4 at a time
export async function everyone(ids: ReadonlyArray<string>) {
  const results = new Array(ids.length)
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const index = next++
      results[index] = await profile(ids[index]!)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return results
}
