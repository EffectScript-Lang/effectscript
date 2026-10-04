/**
 * The playground's files as a tree for the explorer (ADR-0088): folders in the order their first
 * file appears, files in the order they are listed, as a curated project reads.
 */

export interface Folder {
  readonly kind: "folder"
  readonly name: string
  readonly path: string
  readonly children: ReadonlyArray<Folder | File>
}

export interface File {
  readonly kind: "file"
  readonly name: string
  readonly path: string
}

export type Node = Folder | File

/** The tree of `paths` (`a/b/c.efx`), folders first at each level, in order of appearance. */
export const toTree = (paths: ReadonlyArray<string>): ReadonlyArray<Node> => {
  interface Draft {
    readonly folders: Map<string, Draft>
    readonly files: Array<File>
  }
  const root: Draft = { folders: new Map(), files: [] }
  for (const path of paths) {
    const parts = path.split("/")
    let draft = root
    for (const part of parts.slice(0, -1)) {
      let next = draft.folders.get(part)
      if (next === undefined) {
        next = { folders: new Map(), files: [] }
        draft.folders.set(part, next)
      }
      draft = next
    }
    draft.files.push({ kind: "file", name: parts.at(-1)!, path })
  }
  const build = (draft: Draft, prefix: string): Array<Node> => [
    ...[...draft.folders].map(([name, child]): Folder => {
      const path = prefix === "" ? name : `${prefix}/${name}`
      return { kind: "folder", name, path, children: build(child, path) }
    }),
    ...draft.files
  ]
  return build(root, "")
}

/** The rows a tree shows with these folders open, in order, with their depth. */
export const visibleRows = (
  tree: ReadonlyArray<Node>,
  open: ReadonlySet<string>,
  depth = 0
): Array<{ readonly node: Node; readonly depth: number }> =>
  tree.flatMap((node) => [
    { node, depth },
    ...(node.kind === "folder" && open.has(node.path) ? visibleRows(node.children, open, depth + 1) : [])
  ])

/** Every folder on the way to `path`, so opening a file can reveal it. */
export const ancestors = (path: string): Array<string> => {
  const parts = path.split("/").slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"))
}

/** The TypeScript file an EffectScript file compiles to: `.tsx` when its output has JSX. */
export const outputName = (name: string, jsx: boolean): string => name.replace(/\.efx$/, jsx ? ".tsx" : ".ts")
