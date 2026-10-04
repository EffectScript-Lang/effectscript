/**
 * The two-way playground (spec §9.2, ADR-0054, ADR-0084): a full-screen editor with EffectScript on
 * the left and the Effect TypeScript it compiles to on the right, compiled in a worker as you type.
 * Every part of the EffectScript is linked to what it became: hover or move the cursor and both
 * sides light up, joined by a ribbon. The TypeScript follows the EffectScript as it scrolls.
 */
import { shikiToMonaco } from "@shikijs/monaco"
import dark from "effectscript/blume/shiki/effectscript-dark.json" with { type: "json" }
import type * as Monaco from "monaco-editor/editor/editor.api"
import { useEffect, useRef, useState } from "react"
import { createHighlighter, type ThemeRegistration } from "shiki"
import tsx from "shiki/langs/tsx.mjs"
import typescript from "shiki/langs/typescript.mjs"
import { signalRanges } from "../lib/signals.ts"
import { efxGrammars } from "./grammar.ts"
import { explain, fromGenerated, fromSource, type Link, toGeneratedOffset } from "./mapping.ts"
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

/**
 * The EffectScript theme (`effectscript-dark`, ADR-0079): monochrome, with the return type, `throws`
 * and `needs` in their signal colours (ADR-0078). The editor chrome is set on ink here.
 */
const theme: ThemeRegistration = {
  ...(dark as ThemeRegistration),
  name: "efx-playground",
  colors: {
    "editor.background": "#09090b",
    "editor.foreground": "#c8c8ce",
    "editorGutter.background": "#09090b",
    "editorLineNumber.foreground": "#3f3f46",
    "editorLineNumber.activeForeground": "#a1a1aa",
    "editor.lineHighlightBackground": "#ffffff07",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#ffffff2e",
    "editor.inactiveSelectionBackground": "#ffffff14",
    "editor.selectionHighlightBackground": "#ffffff10",
    "editorCursor.foreground": "#ffffff",
    "editorIndentGuide.background1": "#1c1c20",
    "editorIndentGuide.activeBackground1": "#3f3f46",
    "editorBracketMatch.background": "#ffffff12",
    "editorBracketMatch.border": "#ffffff38",
    "editorWidget.background": "#18181a",
    "editorWidget.border": "#27272a",
    "editorHoverWidget.background": "#18181a",
    "editorHoverWidget.border": "#3f3f46",
    "editorError.foreground": "#f87171",
    "editorWarning.foreground": "#facc15",
    "editorOverviewRuler.border": "#00000000",
    "scrollbarSlider.background": "#ffffff12",
    "scrollbarSlider.hoverBackground": "#ffffff22",
    "scrollbarSlider.activeBackground": "#ffffff30",
    focusBorder: "#00000000"
  }
}

/** What the status bar says about the part under the pointer or cursor. */
interface Active {
  readonly kind: Link["kind"]
  readonly source: string
  readonly generated: string
  readonly note: string | undefined
}

const short = (text: string, max = 64) => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export default function Playground() {
  const main = useRef<HTMLDivElement>(null)
  const efxHost = useRef<HTMLDivElement>(null)
  const tsHost = useRef<HTMLDivElement>(null)
  const ribbon = useRef<SVGSVGElement>(null)
  const [problems, setProblems] = useState<ReadonlyArray<Problem>>([])
  const [notes, setNotes] = useState<ReadonlyArray<Note>>([])
  const [source, setSource] = useState<Side>("efx")
  const [shared, setShared] = useState<"no" | "copied" | string>("no")
  const [preset, setPreset] = useState(() =>
    typeof location !== "undefined" && decodeHash(location.hash) !== undefined ? "shared" : presets[0]!.id
  )
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState<Active | undefined>(undefined)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [drawer, setDrawer] = useState(false)
  const api = useRef<{ load: (code: string) => void; share: () => string } | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    const cleanups: Array<() => void> = []
    void (async () => {
      const monaco = await import("monaco-editor/editor/editor.api")
      const { default: EditorWorker } = await import("monaco-editor/editor/editor.worker?worker")
      ;(globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() }
      const [highlighter] = await Promise.all([
        createHighlighter({ themes: [theme], langs: [...tsx, ...typescript, ...efxGrammars] }),
        // Monaco measures the font when it is created, so the brand's mono must be loaded first
        document.fonts.load("400 14px 'JetBrains Mono'"),
        document.fonts.load("500 14px 'JetBrains Mono'")
      ])
      if (disposed) return
      monaco.languages.register({ id: "efx" })
      monaco.languages.register({ id: "typescript" })
      shikiToMonaco(highlighter, monaco)
      const options: Monaco.editor.IStandaloneEditorConstructionOptions = {
        theme: "efx-playground",
        automaticLayout: true,
        minimap: { enabled: false },
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        // `|>` draws as a play triangle, `=>` and `===` as single symbols (ADR-0080)
        fontLigatures: true,
        fontSize: 14,
        lineHeight: 23,
        wordWrap: "on",
        wrappingIndent: "same",
        padding: { top: 18, bottom: 18 },
        scrollBeyondLastLine: true,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        renderLineHighlight: "line",
        lineNumbersMinChars: 3,
        glyphMargin: false,
        folding: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        occurrencesHighlight: "off",
        bracketPairColorization: { enabled: false },
        stickyScroll: { enabled: false },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        fixedOverflowWidgets: true,
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
      monaco.editor.remeasureFonts()
      const efxModel = efx.getModel()!
      const tsModel = ts.getModel()!
      const range = (model: Monaco.editor.ITextModel, [start, end]: readonly [number, number]) => {
        const a = model.getPositionAt(start)
        const b = model.getPositionAt(end)
        return new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column)
      }

      // the signals: the theme colours A, E and R in EffectScript signatures; in the TypeScript they
      // are the arguments of `Effect.fn.Return<A, E, R>`, which no grammar scope marks (ADR-0078)
      const tsSignals = ts.createDecorationsCollection()
      const paintSignals = () => {
        tsSignals.set(
          signalRanges(tsModel.getValue(), "ts").map((r) => ({
            range: range(tsModel, [r.start, r.end]),
            options: { inlineClassName: `pg-sig pg-sig-${r.signal}` }
          }))
        )
      }

      // the mapping: what was rewritten, always marked; the part in focus, lit on both sides
      let links: ReadonlyArray<Link> = []
      const efxEdits = efx.createDecorationsCollection()
      const tsEdits = ts.createDecorationsCollection()
      const efxActive = efx.createDecorationsCollection()
      const tsActive = ts.createDecorationsCollection()
      let current: Link | undefined
      const paintEdits = () => {
        efxEdits.set(
          links.filter((l) => l.kind === "edit" && l.source[1] > l.source[0]).map((l) => ({
            range: range(efxModel, l.source),
            options: { inlineClassName: "pg-edit-src" }
          }))
        )
        tsEdits.set(
          links.filter((l) => l.kind !== "verbatim").flatMap((l) =>
            l.generated.map((g) => ({ range: range(tsModel, g), options: { inlineClassName: "pg-edit-gen" } }))
          )
        )
      }
      const focus = (link: Link | undefined, from: Side) => {
        current = link
        if (link === undefined) {
          efxActive.clear()
          tsActive.clear()
          setActive(undefined)
          drawRibbon()
          return
        }
        const zero = link.source[0] === link.source[1]
        efxActive.set([{
          range: range(efxModel, zero ? [link.source[0], link.source[0]] : link.source),
          options: zero ? { beforeContentClassName: "pg-caret" } : { inlineClassName: "pg-active" }
        }])
        tsActive.set(
          link.generated.map((g) => ({ range: range(tsModel, g), options: { inlineClassName: "pg-active" } }))
        )
        if (from === "efx") {
          ts.revealRangeInCenterIfOutsideViewport(range(tsModel, link.generated[0]!), monaco.editor.ScrollType.Smooth)
        } else if (!zero) {
          efx.revealRangeInCenterIfOutsideViewport(range(efxModel, link.source), monaco.editor.ScrollType.Smooth)
        }
        const efxText = efxModel.getValue()
        const tsText = tsModel.getValue()
        const sourceText = efxText.slice(link.source[0], link.source[1])
        setActive({
          kind: link.kind,
          source: link.kind === "prelude" ? "(the prelude)" : zero ? "(inserted)" : short(sourceText, 40),
          generated: link.generated.map((g) => short(tsText.slice(g[0], g[1]), 48)).join("  …  "),
          note: link.kind === "prelude"
            ? "imports the compiler adds for the builtins you used"
            : link.kind === "verbatim"
            ? "kept as written"
            : explain(sourceText)
        })
        drawRibbon()
      }

      // the ribbon: from the end of the source part to the start of what it became
      let frame = 0
      const drawRibbon = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          const svg = ribbon.current
          const box = main.current?.getBoundingClientRect()
          if (svg === null || box === undefined) return
          const stacked = window.matchMedia("(max-width: 900px)").matches
          if (current === undefined || stacked || lastEdited !== "efx") {
            svg.replaceChildren()
            return
          }
          const efxBox = efx.getDomNode()!.getBoundingClientRect()
          const tsBox = ts.getDomNode()!.getBoundingClientRect()
          // a point just under the text of a line, so guides never strike through code
          const under = (
            editor: Monaco.editor.ICodeEditor,
            model: Monaco.editor.ITextModel,
            edge: DOMRect,
            offset: number
          ) => {
            const visible = editor.getScrolledVisiblePosition(model.getPositionAt(offset))
            if (visible === null) return undefined
            const y = edge.top - box.top + visible.top + visible.height - 2
            const clamped = Math.min(Math.max(y, edge.top - box.top + 6), edge.bottom - box.top - 6)
            return { x: edge.left - box.left + visible.left, y: clamped, hidden: clamped !== y }
          }
          const from = under(efx, efxModel, efxBox, current.source[1])
          // the wire crosses between the panes: from the source pane's edge to the output's text column
          const edgeFrom = efxBox.right - box.left - 14
          const edgeTo = tsBox.left - box.left + ts.getLayoutInfo().contentLeft - 4
          const paths: Array<string> = []
          const dots: Array<string> = []
          current.generated.forEach((g, i) => {
            const to = under(ts, tsModel, tsBox, g[0])
            if (from === undefined || to === undefined) return
            const fade = from.hidden || to.hidden ? 0.35 : 1
            const strength = (i === 0 ? 1 : 0.5) * fade
            const bend = Math.max(28, (edgeTo - edgeFrom) * 0.5)
            const wire = `M ${edgeFrom} ${from.y} C ${edgeFrom + bend} ${from.y}, ${
              edgeTo - bend
            } ${to.y}, ${edgeTo} ${to.y}`
            if (i === 0) {
              paths.push(
                `<path d="M ${from.x} ${from.y} H ${edgeFrom}" stroke="#fff" stroke-opacity="${
                  0.28 * fade
                }" stroke-width="1" stroke-dasharray="2 4"/>`
              )
            }
            paths.push(
              `<path d="${wire}" fill="none" stroke="#fff" stroke-opacity="${
                0.12 * strength
              }" stroke-width="6" stroke-linecap="round"/>`,
              `<path d="${wire}" fill="none" stroke="#fff" stroke-opacity="${0.9 * strength}" stroke-width="${
                i === 0 ? 1.4 : 1
              }"/>`,
              `<path d="M ${edgeTo} ${to.y} H ${to.x}" stroke="#fff" stroke-opacity="${
                0.28 * strength
              }" stroke-width="1" stroke-dasharray="2 4"/>`
            )
            dots.push(
              `<circle cx="${to.x}" cy="${to.y}" r="${i === 0 ? 2.6 : 2}" fill="#fff" fill-opacity="${strength}"/>`
            )
          })
          if (from !== undefined && paths.length > 0) {
            dots.push(`<circle cx="${from.x}" cy="${from.y}" r="2.6" fill="#fff"/>`)
          }
          svg.innerHTML = paths.join("") + dots.join("")
        })
      }

      // the TypeScript follows the EffectScript: the line at the top of one lines up with its output
      let syncing = false
      const follow = () => {
        if (lastEdited !== "efx" || links.length === 0) return
        const top = efx.getVisibleRanges()[0]?.startLineNumber ?? 1
        const offset = efxModel.getOffsetAt({ lineNumber: top, column: 1 })
        const line = tsModel.getPositionAt(toGeneratedOffset(links, offset)).lineNumber
        const delta = efx.getScrollTop() - efx.getTopForLineNumber(top)
        syncing = true
        ts.setScrollTop(Math.max(0, ts.getTopForLineNumber(line) + delta))
        syncing = false
      }

      const tracker = createTracker()
      let applying = false
      let lastEdited: Side = "efx"
      let timer: ReturnType<typeof setTimeout> | undefined
      let hovering = false

      // a compile that hangs (a pathological input) restarts the worker instead of freezing the panes
      const spawn = () => {
        const fresh = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
        fresh.onmessage = onMessage
        return fresh
      }
      // the watchdog guards compiles, not loading: it is armed only once the worker has answered,
      // and any answer shows the worker is alive (Plan 18 review)
      let alive = false
      const watchdog = createWatchdog(5000, () => {
        worker.terminate()
        alive = false
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
        // the new worker gets the newest code, once
        request(lastEdited)
      })
      const request = (side: Side) => {
        const seq = tracker.next()
        const editor = side === "efx" ? efx : ts
        if (alive && !watchdog.running()) watchdog.start()
        worker.postMessage({
          seq,
          direction: side === "efx" ? "toTypeScript" : "toEffectScript",
          source: editor.getValue()
        })
      }
      function onMessage(event: MessageEvent<Response>) {
        const response = event.data
        alive = true
        if (!tracker.accept(response.seq)) {
          // still working through older requests: alive, and a newer one is on its way
          watchdog.start()
          return
        }
        watchdog.stop()
        const pane = paneToUpdate(response)
        if (pane !== undefined) {
          const target = pane === "ts" ? ts : efx
          applying = true
          if (target.getValue() !== response.code) {
            const state = target.saveViewState()
            target.setValue(response.code!)
            if (state !== null) target.restoreViewState(state)
          }
          applying = false
        }
        links = response.direction === "toTypeScript" ? response.links : []
        monaco.editor.setModelMarkers(
          efxModel,
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
        paintSignals()
        paintEdits()
        focus(undefined, "efx")
        if (lastEdited === "efx") {
          focus(fromSource(links, efxModel.getValue(), efxModel.getOffsetAt(efx.getPosition()!)), "efx")
          follow()
        }
      }
      let worker = spawn()
      const changed = (side: Side) => () => {
        if (applying) return
        // a link shown for copying by hand would no longer match the code
        setShared((current) => (current === "copied" ? current : "no"))
        lastEdited = side
        setSource(side)
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(() => request(side), 120)
      }

      const listeners = [
        efx.onDidChangeModelContent(changed("efx")),
        ts.onDidChangeModelContent(changed("ts")),
        efx.onMouseMove((e) => {
          if (lastEdited !== "efx" || e.target.position === null) return
          hovering = true
          focus(fromSource(links, efxModel.getValue(), efxModel.getOffsetAt(e.target.position)), "efx")
        }),
        ts.onMouseMove((e) => {
          if (lastEdited !== "efx" || e.target.position === null) return
          hovering = true
          focus(fromGenerated(links, tsModel.getValue(), tsModel.getOffsetAt(e.target.position)), "ts")
        }),
        efx.onMouseLeave(() => {
          hovering = false
          if (lastEdited === "efx") {
            focus(fromSource(links, efxModel.getValue(), efxModel.getOffsetAt(efx.getPosition()!)), "efx")
          }
        }),
        ts.onMouseLeave(() => {
          hovering = false
        }),
        efx.onDidChangeCursorPosition((e) => {
          setCursor({ line: e.position.lineNumber, column: e.position.column })
          if (!hovering && lastEdited === "efx") {
            focus(fromSource(links, efxModel.getValue(), efxModel.getOffsetAt(e.position)), "efx")
          }
        }),
        efx.onDidScrollChange((e) => {
          if (e.scrollTopChanged && !syncing) follow()
          drawRibbon()
        }),
        ts.onDidScrollChange(() => drawRibbon()),
        efx.onDidLayoutChange(() => drawRibbon()),
        ts.onDidLayoutChange(() => drawRibbon())
      ]
      cleanups.push(() => listeners.forEach((l) => l.dispose()))
      api.current = {
        load: (code) => {
          lastEdited = "efx"
          setSource("efx")
          efx.setValue(code)
          efx.setScrollTop(0)
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
      window.addEventListener("resize", drawRibbon)
      request("efx")
      efx.focus()
      setReady(true)
      cleanups.push(
        () => window.removeEventListener("hashchange", onHash),
        () => window.removeEventListener("resize", drawRibbon),
        () => clearTimeout(timer),
        () => cancelAnimationFrame(frame),
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

  const errors = problems.filter((p) => p.severity === "error").length
  const warnings = problems.length - errors

  return (
    <div className="pg" data-source={source}>
      <div className="pg-toolbar">
        <label className="pg-field">
          <span>Example</span>
          <select
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
        </label>
        <button type="button" onClick={share} className="pg-button" disabled={!ready}>
          {shared === "copied" ? "Link copied" : "Share"}
        </button>
        {shared !== "no" && shared !== "copied" && (
          <input
            aria-label="Share link"
            readOnly
            value={shared}
            onFocus={(e) => e.currentTarget.select()}
            className="pg-link"
          />
        )}
        <ul className="pg-legend" aria-label="Signal colours">
          <li className="pass">✓ A succeeds with</li>
          <li className="fail">! E fails with</li>
          <li className="need">◇ R needs</li>
        </ul>
      </div>

      <div className="pg-main" ref={main}>
        <section className="pg-pane pg-efx" aria-label="EffectScript">
          <div className="pg-tab">
            <span className="pg-tab-name">playground.efx</span>
            <span className="pg-tab-role">{source === "efx" ? "you write" : "converted from TypeScript"}</span>
          </div>
          <div ref={efxHost} className="pg-editor" />
        </section>
        <section className="pg-pane pg-ts" aria-label="TypeScript">
          <div className="pg-tab">
            <span className="pg-tab-name">playground.ts</span>
            <span className="pg-tab-role">{source === "efx" ? "Effect v4 · compiled as you type" : "you write"}</span>
          </div>
          <div ref={tsHost} className="pg-editor" />
        </section>
        <svg className="pg-ribbon" ref={ribbon} aria-hidden="true" />
        {!ready && <p className="pg-loading">Loading the compiler and the editor…</p>}
      </div>

      {drawer && (
        <section className="pg-problems" aria-label="Problems">
          <ul>
            {problems.length === 0 && notes.length === 0 && <li className="pg-quiet">No problems</li>}
            {problems.map((p, i) => (
              <li key={`p${i}`} className={p.severity}>
                <b>{p.severity === "error" ? "! " : "▲ "}{p.code}</b> {p.message} <span>{p.line}:{p.column}</span>
              </li>
            ))}
            {notes.map((n, i) => (
              <li key={`n${i}`} className="note">
                <b>left as TypeScript</b> {n.message} <span>{n.line}:{n.column}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pg-status">
        <span className="pg-mode">{source === "efx" ? "EffectScript → TypeScript" : "TypeScript → EffectScript"}</span>
        <span className="pg-map" aria-live="polite">
          {source !== "efx"
            ? "The mapping shows while you edit the EffectScript"
            : active === undefined
            ? "Hover or move through the EffectScript to see what each part becomes"
            : (
              <>
                <code>{active.source}</code>
                <span className="pg-arrow">→</span>
                <code>{active.generated}</code>
                {active.note !== undefined && <em>{active.note}</em>}
              </>
            )}
        </span>
        <button type="button" className="pg-count" onClick={() => setDrawer((open) => !open)} aria-expanded={drawer}>
          <span className={errors > 0 ? "fail" : ""}>! {errors}</span>
          <span className={warnings > 0 ? "warn" : ""}>▲ {warnings}</span>
          {notes.length > 0 && <span>◇ {notes.length}</span>}
        </button>
        <span className="pg-pos">Ln {cursor.line}, Col {cursor.column}</span>
      </footer>
    </div>
  )
}
