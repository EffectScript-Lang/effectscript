/**
 * The two-way playground (spec §9.2, ADR-0054): EffectScript on the left, TypeScript on the right.
 * The pane you edit is the source and the other follows, compiled in a worker. Shiki's Monaco
 * bridge gives both the same grammar as the docs.
 */
import { shikiToMonaco } from "@shikijs/monaco"
import type * as Monaco from "monaco-editor/editor/editor.api"
import { useEffect, useRef, useState } from "react"
import { createHighlighter } from "shiki"
import tsx from "shiki/langs/tsx.mjs"
import typescript from "shiki/langs/typescript.mjs"
import { efxGrammars } from "./grammar.ts"
import { presets } from "./presets.ts"
import {
  createTracker,
  createWatchdog,
  decodeHash,
  encodeHash,
  type Note,
  paneToUpdate,
  type Problem,
  type Response
} from "./protocol.ts"

type Side = "efx" | "ts"

export default function Playground() {
  const efxHost = useRef<HTMLDivElement>(null)
  const tsHost = useRef<HTMLDivElement>(null)
  const [problems, setProblems] = useState<ReadonlyArray<Problem>>([])
  const [notes, setNotes] = useState<ReadonlyArray<Note>>([])
  const [source, setSource] = useState<Side>("efx")
  const [shared, setShared] = useState<"no" | "copied" | string>("no")
  const [preset, setPreset] = useState(() =>
    typeof location !== "undefined" && decodeHash(location.hash) !== undefined ? "shared" : presets[0]!.id
  )
  const [ready, setReady] = useState(false)
  const api = useRef<{ load: (code: string) => void; share: () => string } | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    const cleanups: Array<() => void> = []
    void (async () => {
      const monaco = await import("monaco-editor/editor/editor.api")
      const { default: EditorWorker } = await import("monaco-editor/editor/editor.worker?worker")
      ;(globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() }
      const highlighter = await createHighlighter({
        themes: ["dark-plus"],
        langs: [...tsx, ...typescript, ...efxGrammars]
      })
      if (disposed) return
      monaco.languages.register({ id: "efx" })
      monaco.languages.register({ id: "typescript" })
      shikiToMonaco(highlighter, monaco)
      const options: Monaco.editor.IStandaloneEditorConstructionOptions = {
        theme: "dark-plus",
        automaticLayout: true,
        minimap: { enabled: false },
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontLigatures: false,
        fontSize: 13,
        scrollBeyondLastLine: false,
        tabSize: 2
      }
      const initial = decodeHash(location.hash) ?? presets[0]!.code
      const efx = monaco.editor.create(efxHost.current!, {
        ...options,
        value: initial,
        language: "efx",
        ariaLabel: "EffectScript editor"
      })
      const ts = monaco.editor.create(tsHost.current!, {
        ...options,
        value: "",
        language: "typescript",
        ariaLabel: "TypeScript editor"
      })
      const tracker = createTracker()
      let applying = false
      let lastEdited: Side = "efx"
      let timer: ReturnType<typeof setTimeout> | undefined

      // a compile that hangs (a pathological input) restarts the worker instead of freezing the panes
      const spawn = () => {
        const fresh = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
        fresh.onmessage = onMessage
        return fresh
      }
      const watchdog = createWatchdog(5000, () => {
        worker.terminate()
        worker = spawn()
        setProblems([{
          code: "EFX0000",
          message: "The compiler took over 5 seconds on this code and was restarted",
          severity: "error",
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 1
        }])
      })
      const request = (side: Side) => {
        const seq = tracker.next()
        const editor = side === "efx" ? efx : ts
        watchdog.start()
        worker.postMessage({
          seq,
          direction: side === "efx" ? "toTypeScript" : "toEffectScript",
          source: editor.getValue()
        })
      }
      function onMessage(event: MessageEvent<Response>) {
        const response = event.data
        if (!tracker.accept(response.seq)) return // a newer request is on its way
        watchdog.stop()
        const pane = paneToUpdate(response)
        if (pane !== undefined) {
          const target = pane === "ts" ? ts : efx
          applying = true
          if (target.getValue() !== response.code) target.setValue(response.code!)
          applying = false
        }
        monaco.editor.setModelMarkers(
          efx.getModel()!,
          "effectscript",
          response.diagnostics.map((d) => ({
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.endLine,
            endColumn: d.endColumn,
            message: `${d.code}: ${d.message}`,
            severity: d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
          }))
        )
        setProblems(response.diagnostics)
        setNotes(response.notes)
      }
      let worker = spawn()
      const changed = (side: Side) => () => {
        if (applying) return
        lastEdited = side
        setSource(side)
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(() => request(side), 150)
      }
      const listeners = [efx.onDidChangeModelContent(changed("efx")), ts.onDidChangeModelContent(changed("ts"))]
      cleanups.push(() => listeners.forEach((l) => l.dispose()))
      api.current = {
        load: (code) => {
          lastEdited = "efx"
          setSource("efx")
          efx.setValue(code)
        },
        share: () => encodeHash(lastEdited === "efx" ? efx.getValue() : ts.getValue())
      }
      // a share link opened while on this page
      const onHash = () => {
        const code = decodeHash(location.hash)
        if (code === undefined) return
        setPreset("shared")
        api.current?.load(code)
      }
      window.addEventListener("hashchange", onHash)
      request("efx")
      setReady(true)
      cleanups.push(
        () => window.removeEventListener("hashchange", onHash),
        () => watchdog.stop(),
        () => worker.terminate(),
        () => efx.dispose(),
        () => ts.dispose()
      )
    })()
    return () => {
      disposed = true
      for (const cleanup of cleanups.splice(0)) cleanup()
    }
  }, [])

  const share = async () => {
    const hash = api.current?.share()
    if (hash === undefined) return
    history.replaceState(null, "", hash)
    const copied = await (navigator.clipboard?.writeText(location.href).then(() => true, () => false) ?? false)
    // without clipboard access, the link is shown to copy by hand
    setShared(copied ? "copied" : location.href)
    if (copied) setTimeout(() => setShared("no"), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="label" htmlFor="preset">Preset</label>
        <select
          id="preset"
          className="rounded border border-line bg-tile px-2 py-1 text-sm"
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value)
            api.current?.load(presets.find((p) => p.id === e.target.value)!.code)
          }}
          disabled={!ready}
        >
          {preset === "shared" && <option value="shared" disabled>Shared code</option>}
          {presets.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <button
          type="button"
          onClick={share}
          className="rounded border border-line px-3 py-1 text-sm hover:bg-tile"
          disabled={!ready}
        >
          {shared === "copied" ? "Link copied" : "Share"}
        </button>
        {shared !== "no" && shared !== "copied" && (
          <input
            aria-label="Share link"
            readOnly
            value={shared}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-line bg-tile px-2 py-1 font-mono text-xs"
          />
        )}
        <span className="label" aria-live="polite">
          {source === "efx" ? "Editing EffectScript → TypeScript" : "Editing TypeScript → EffectScript"}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="EffectScript" className="overflow-hidden rounded-lg border border-line">
          <header className="label border-b border-line bg-tile px-3 py-2">playground.efx</header>
          <div ref={efxHost} className="h-[28rem]" />
        </section>
        <section aria-label="TypeScript" className="overflow-hidden rounded-lg border border-line">
          <header className="label border-b border-line bg-tile px-3 py-2">playground.ts (Effect)</header>
          <div ref={tsHost} className="h-[28rem]" />
        </section>
      </div>
      <section aria-label="Problems" className="rounded-lg border border-line">
        <header className="label border-b border-line bg-tile px-3 py-2">
          Problems {problems.length > 0 ? `(${problems.length})` : ""}
        </header>
        <ul className="divide-y divide-line font-mono text-sm">
          {problems.length === 0 && notes.length === 0 && <li className="px-3 py-2 text-subtle">No problems</li>}
          {problems.map((p, i) => (
            <li key={`p${i}`} className="px-3 py-2">
              <span className={p.severity === "error" ? "text-red-400" : "text-yellow-300"}>{p.code}</span> {p.message}
              {" "}
              <span className="text-muted">({p.line}:{p.column})</span>
            </li>
          ))}
          {notes.map((n, i) => (
            <li key={`n${i}`} className="px-3 py-2 text-subtle">
              left as TypeScript: {n.message} <span className="text-muted">({n.line}:{n.column})</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
