/**
 * The playground's explorer (ADR-0088): the example files in folders, as an editor's sidebar shows
 * a project. A proposed file carries Warn's triangle (ADR-0078); an edited one, a dot.
 */
import { type KeyboardEvent, useMemo, useRef, useState } from "react"
import { ancestors, type Node, toTree, visibleRows } from "./files.ts"

export interface ExplorerFile {
  readonly path: string
  readonly title: string
  /** The ADR of a proposed file, whose syntax isn't built yet. */
  readonly proposal?: string | undefined
}

/** The brand's `.efx` file icon (brand/icons/editor/file-efx-dark.svg), in the text colour. */
const EfxIcon = () => (
  <svg className="pg-x-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8.96 1.95L6.26 1.95A3.65 3.65 0 0 0 2.61 5.6L2.61 11.12A1.22 1.22 0 0 1 1.39 12.34L0.64 12.34L0.64 13.86L1.9 13.86A2.61 2.61 0 0 0 4.5 11.26L4.5 5.41A1.89 1.89 0 0 1 6.39 3.52L8.96 3.52ZM3.56 7.71L8.16 7.71L13.08 13.86L15.36 13.86L9.22 6.19L3.56 6.19ZM6.32 13.86L8.45 13.86L15.32 6.19L13.19 6.19Z"
    />
  </svg>
)

const Chevron = () => (
  <svg className="pg-x-chevron" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export default function Explorer(props: {
  readonly files: ReadonlyArray<ExplorerFile>
  readonly current: string
  readonly modified: ReadonlySet<string>
  readonly onOpen: (path: string) => void
}) {
  const { current, files, modified, onOpen } = props
  const tree = useMemo(() => toTree(files.map((f) => f.path)), [files])
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files])
  // every folder starts open, as a small curated project reads best
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const folders = new Set<string>()
    const walk = (nodes: ReadonlyArray<Node>) =>
      nodes.forEach((n) => {
        if (n.kind === "folder") {
          folders.add(n.path)
          walk(n.children)
        }
      })
    walk(tree)
    return folders
  })
  const shown = useMemo(() => visibleRows(tree, open), [tree, open])
  // one row takes Tab focus: the open file, or the first row while its folder is closed
  const focusable = shown.some((r) => r.node.path === current) ? current : shown[0]?.node.path
  const list = useRef<HTMLUListElement>(null)

  const toggle = (path: string, to?: boolean) =>
    setOpen((was) => {
      const next = new Set(was)
      if (to ?? !next.has(path)) next.add(path)
      else next.delete(path)
      return next
    })

  // arrow keys move through the rows, left and right close and open folders, as in an editor
  const onKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>("[data-row]") ?? [])]
    const at = rows.indexOf(document.activeElement as HTMLButtonElement)
    if (at === -1) return
    const row = shown[at]!
    const move = (to: number) => rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus()
    if (event.key === "ArrowDown") move(at + 1)
    else if (event.key === "ArrowUp") move(at - 1)
    else if (event.key === "Home") move(0)
    else if (event.key === "End") move(rows.length - 1)
    else if (event.key === "ArrowRight" && row.node.kind === "folder") toggle(row.node.path, true)
    else if (event.key === "ArrowLeft" && row.node.kind === "folder" && open.has(row.node.path)) {
      toggle(row.node.path, false)
    } else if (event.key === "ArrowLeft") {
      const parent = ancestors(row.node.path).at(-1)
      move(shown.findIndex((r) => r.node.path === parent))
    } else return
    event.preventDefault()
  }

  return (
    <nav className="pg-explorer" aria-label="Example files">
      <h2 className="pg-x-title">Explorer</h2>
      <ul className="pg-x-tree" role="tree" ref={list} onKeyDown={onKey}>
        {shown.map(({ depth, node }) => {
          const file = byPath.get(node.path)
          const isOpen = node.kind === "folder" && open.has(node.path)
          return (
            <li
              key={node.path}
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={node.kind === "folder" ? isOpen : undefined}
              aria-selected={node.path === current}
            >
              <button
                type="button"
                data-row
                className={`pg-x-row${node.path === current ? " active" : ""}`}
                style={{ paddingLeft: `${10 + depth * 12}px` }}
                title={file === undefined ? undefined : file.title}
                tabIndex={node.path === focusable ? 0 : -1}
                onClick={() => (node.kind === "folder" ? toggle(node.path) : onOpen(node.path))}
              >
                {node.kind === "folder"
                  ? (
                    <span className={`pg-x-fold${isOpen ? " open" : ""}`}>
                      <Chevron />
                    </span>
                  )
                  : <EfxIcon />}
                <span className="pg-x-name">{node.name}</span>
                {modified.has(node.path) && <span className="pg-x-dot" aria-label="edited" />}
                {file?.proposal !== undefined && (
                  <span className="pg-x-proposed" title={`Proposed in ${file.proposal}: not built yet`}>▲</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="pg-x-note">
        <span className="pg-x-proposed">▲</span> proposed syntax, shown with the TypeScript its ADR specifies
      </p>
    </nav>
  )
}
