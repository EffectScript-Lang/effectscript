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
import { efxGrammars } from "./grammar.ts"
import { namesOf, paint, type Painted } from "./intent.ts"
import {
  type Concept,
  conceptAt,
  describeConcept,
  explain,
  fromGenerated,
  fromSource,
  type Link,
  toGeneratedOffset
} from "./mapping.ts"
import { type Preset, presets } from "./presets.ts"
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
  const [proposal, setProposal] = useState<Preset["proposal"]>(undefined)
  const api = useRef<{ load: (preset: Pick<Preset, "code" | "proposal">) => void; share: () => string } | undefined>(
    undefined
  )

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

      // intent colours: one reading for both panes, with the names each side declares (ADR-0085)
      const efxPaint = efx.createDecorationsCollection()
      const tsPaint = ts.createDecorationsCollection()
      // a comment is kept as written: the mapping has nothing to say about it
      let comments: ReadonlyArray<Painted> = []
      const paintIntent = () => {
        const efxText = efxModel.getValue()
        const tsText = tsModel.getValue()
        const names = namesOf(efxText, tsText)
        const decorate = (model: Monaco.editor.ITextModel, painted: ReadonlyArray<Painted>) =>
          painted.map((p) => ({
            range: range(model, [p.start, p.end]),
            options: { inlineClassName: `pg-r-${p.role}` }
          }))
        const efxPainted = paint(efxText, "efx", names)
        comments = efxPainted.filter((p) => p.role === "comment")
        efxPaint.set(decorate(efxModel, efxPainted))
        tsPaint.set(decorate(tsModel, paint(tsText, "ts", names)))
      }

      // the mapping: the concept in focus lights as a block on both sides, joined by a band; the
      // rewritten part under the pointer stands out inside it; rewritten parts are always underlined
      let links: ReadonlyArray<Link> = []
      let concepts: ReadonlyArray<Concept> = []
      const efxEdits = efx.createDecorationsCollection()
      const efxBlock = efx.createDecorationsCollection()
      const tsBlock = ts.createDecorationsCollection()
      const efxActive = efx.createDecorationsCollection()
      const tsActive = ts.createDecorationsCollection()
      let current: { readonly concept: Concept | undefined; readonly link: Link | undefined } = {
        concept: undefined,
        link: undefined
      }
      const paintEdits = () => {
        efxEdits.set(
          links.filter((l) => l.kind === "edit" && l.source[1] > l.source[0]).map((l) => ({
            range: range(efxModel, l.source),
            options: { inlineClassName: "pg-edit-src" }
          }))
        )
      }
      const block = (model: Monaco.editor.ITextModel, r: readonly [number, number]) => ({
        range: range(model, r),
        options: { inlineClassName: "pg-block", linesDecorationsClassName: "pg-bracket" }
      })
      const focus = (concept: Concept | undefined, link: Link | undefined, from: Side) => {
        if (current.concept === concept && current.link === link) return
        current = { concept, link }
        efxBlock.set(concept === undefined ? [] : [block(efxModel, concept.source)])
        tsBlock.set(concept === undefined ? [] : concept.generated.map((g) => block(tsModel, g)))
        const zero = link !== undefined && link.source[0] === link.source[1]
        efxActive.set(
          link === undefined
            ? []
            : [{
              range: range(efxModel, zero ? [link.source[0], link.source[0]] : link.source),
              options: zero ? { beforeContentClassName: "pg-caret" } : { inlineClassName: "pg-active" }
            }]
        )
        tsActive.set(
          (link?.generated ?? []).map((g) => ({ range: range(tsModel, g), options: { inlineClassName: "pg-active" } }))
        )
        const target = concept?.generated[0] ?? link?.generated[0]
        if (from === "efx" && target !== undefined) {
          ts.revealRangeInCenterIfOutsideViewport(range(tsModel, target), monaco.editor.ScrollType.Smooth)
        } else if (from === "ts" && concept !== undefined) {
          efx.revealRangeInCenterIfOutsideViewport(range(efxModel, concept.source), monaco.editor.ScrollType.Smooth)
        }
        const efxText = efxModel.getValue()
        const tsText = tsModel.getValue()
        if (concept !== undefined) {
          setActive({
            kind: "edit",
            source: short(efxText.slice(...concept.source), 44),
            generated: concept.generated.map((g) => short(tsText.slice(...g), 56)).join("  …  "),
            note: describeConcept(concept, efxText, tsText)
          })
        } else if (link !== undefined) {
          const sourceText = efxText.slice(...link.source)
          setActive({
            kind: link.kind,
            source: link.kind === "prelude" ? "(the prelude)" : zero ? "(inserted)" : short(sourceText, 40),
            generated: link.generated.map((g) => short(tsText.slice(...g), 48)).join("  …  "),
            note: link.kind === "prelude"
              ? "imports the compiler adds for the builtins you used"
              : link.kind === "verbatim"
              ? "kept as written"
              : explain(sourceText)
          })
        } else setActive(undefined)
        drawRibbon()
      }
      const focusSource = (offset: number) =>
        comments.some((c) => offset >= c.start && offset < c.end)
          ? focus(undefined, undefined, "efx")
          : focus(conceptAt(concepts, offset, "source"), fromSource(links, efxModel.getValue(), offset), "efx")
      const focusGenerated = (offset: number) =>
        focus(conceptAt(concepts, offset, "generated"), fromGenerated(links, tsModel.getValue(), offset), "ts")

      // the band: the concept's lines on one side joined to its output's lines on the other
      let frame = 0
      const drawRibbon = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          const svg = ribbon.current
          const box = main.current?.getBoundingClientRect()
          if (svg === null || box === undefined) return
          const stacked = window.matchMedia("(max-width: 900px)").matches
          const { concept, link } = current
          const sourceRange = concept?.source ?? link?.source
          const targets = concept?.generated ?? link?.generated ?? []
          if (sourceRange === undefined || stacked || lastEdited !== "efx") {
            svg.replaceChildren()
            return
          }
          const efxBox = efx.getDomNode()!.getBoundingClientRect()
          const tsBox = ts.getDomNode()!.getBoundingClientRect()
          // the top and bottom of a range's lines, in the overlay's coordinates, kept inside the pane
          const span = (
            editor: Monaco.editor.ICodeEditor,
            model: Monaco.editor.ITextModel,
            edge: DOMRect,
            [start, end]: readonly [number, number]
          ) => {
            const a = editor.getScrolledVisiblePosition(model.getPositionAt(start))
            const b = editor.getScrolledVisiblePosition(model.getPositionAt(Math.max(start, end - 1)))
            if (a === null || b === null) return undefined
            const clamp = (y: number) => Math.min(Math.max(y, edge.top - box.top + 2), edge.bottom - box.top - 2)
            const top = edge.top - box.top + a.top
            const bottom = edge.top - box.top + b.top + b.height
            return { top: clamp(top), bottom: clamp(bottom), hidden: clamp(top) !== top && clamp(bottom) !== bottom }
          }
          const from = span(efx, efxModel, efxBox, sourceRange)
          // the band crosses the channel between the panes, so it never covers code or line numbers
          const x1 = efxBox.right - box.left
          const x2 = tsBox.left - box.left
          const bend = (x2 - x1) * 0.5
          const shapes: Array<string> = []
          targets.forEach((g, i) => {
            const to = span(ts, tsModel, tsBox, g)
            if (from === undefined || to === undefined) return
            const strength = (i === 0 ? 1 : 0.6) * (from.hidden || to.hidden ? 0.35 : 1)
            const band = `M ${x1} ${from.top} C ${x1 + bend} ${from.top}, ${x2 - bend} ${to.top}, ${x2} ${to.top} ` +
              `L ${x2} ${to.bottom} C ${x2 - bend} ${to.bottom}, ${x1 + bend} ${from.bottom}, ${x1} ${from.bottom} Z`
            shapes.push(
              `<path d="${band}" fill="#fff" fill-opacity="${0.075 * strength}" stroke="#fff" stroke-opacity="${
                0.45 * strength
              }" stroke-width="1"/>`
            )
          })
          svg.innerHTML = shapes.join("")
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
      // a proposed preset's lowering, shown instead of the compiler's output until the code is edited
      let pinned: string | undefined
      let loading = false
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
          const code = pane === "ts" && pinned !== undefined ? pinned : response.code!
          applying = true
          if (target.getValue() !== code) {
            const state = target.saveViewState()
            target.setValue(code)
            if (state !== null) target.restoreViewState(state)
          }
          applying = false
        }
        // the compiler refuses a proposal's syntax, so its problems and its mapping aren't shown
        const live = response.direction === "toTypeScript" && pinned === undefined
        const diagnostics = pinned === undefined ? response.diagnostics : []
        links = live ? response.links : []
        concepts = live ? response.concepts : []
        monaco.editor.setModelMarkers(
          efxModel,
          "effectscript",
          diagnostics.map((d) => ({
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.endLine,
            endColumn: d.endColumn,
            message: `${d.code}: ${d.message}`,
            severity: d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
          }))
        )
        setProblems(diagnostics)
        setNotes(pinned === undefined ? response.notes : [])
        paintIntent()
        paintEdits()
        // the old focus points into the old text: drop it, then find it again in the new one
        for (const collection of [efxBlock, tsBlock, efxActive, tsActive]) collection.clear()
        current = { concept: undefined, link: undefined }
        setActive(undefined)
        drawRibbon()
        if (lastEdited === "efx") {
          focusSource(efxModel.getOffsetAt(efx.getPosition()!))
          follow()
        }
      }
      let worker = spawn()
      const changed = (side: Side) => () => {
        if (applying) return
        if (!loading && pinned !== undefined) {
          // edited: from here on, the compiler's own answer
          pinned = undefined
          setProposal(undefined)
        }
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
          focusSource(efxModel.getOffsetAt(e.target.position))
        }),
        ts.onMouseMove((e) => {
          if (lastEdited !== "efx" || e.target.position === null) return
          hovering = true
          focusGenerated(tsModel.getOffsetAt(e.target.position))
        }),
        efx.onMouseLeave(() => {
          hovering = false
          if (lastEdited === "efx") {
            focusSource(efxModel.getOffsetAt(efx.getPosition()!))
          }
        }),
        ts.onMouseLeave(() => {
          hovering = false
        }),
        efx.onDidChangeCursorPosition((e) => {
          setCursor({ line: e.position.lineNumber, column: e.position.column })
          if (!hovering && lastEdited === "efx") {
            focusSource(efxModel.getOffsetAt(e.position))
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
        load: ({ code, proposal }) => {
          lastEdited = "efx"
          setSource("efx")
          pinned = proposal?.lowering
          setProposal(proposal)
          loading = true
          efx.setValue(code)
          loading = false
          efx.setScrollTop(0)
          ts.setScrollTop(0)
        },
        share: () => encodeHash(lastEdited === "efx" ? efx.getValue() : ts.getValue())
      }
      // a share link opened while on this page
      const onHash = () => {
        const code = decodeHash(location.hash)
        if (code === undefined) return
        setPreset("shared")
        api.current?.load({ code })
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
              api.current?.load(presets.find((p) => p.id === e.target.value)!)
            }}
            disabled={!ready}
          >
            {preset === "shared" && <option value="shared" disabled>Shared code</option>}
            {[...new Set(presets.map((p) => p.group))].map((group) => (
              <optgroup key={group} label={group}>
                {presets.filter((p) => p.group === group).map((p) => <option key={p.id} value={p.id}>{p.title}
                </option>)}
              </optgroup>
            ))}
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
        <ul className="pg-legend" aria-label="What the colours mean">
          <li className="pg-r-effect">effect</li>
          <li className="pg-r-keyword">structure</li>
          <li className="pg-r-pass">✓ data, success</li>
          <li className="pg-r-fail">! errors</li>
          <li className="pg-r-need">◇ services</li>
          <li className="pg-r-type">types</li>
          <li className="pg-r-literal">literals</li>
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
        <div className="pg-channel" aria-hidden="true" />
        <section className="pg-pane pg-ts" aria-label="TypeScript">
          <div className="pg-tab">
            <span className="pg-tab-name">playground.ts</span>
            <span className="pg-tab-role">
              {proposal !== undefined
                ? `the lowering ${proposal.adr} specifies`
                : source === "efx"
                ? "Effect v4 · compiled as you type"
                : "you write"}
            </span>
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
          {proposal !== undefined
            ? (
              <span className="pg-proposal">
                <b>▲ {proposal.adr}</b>{" "}
                {proposal.status}. The TypeScript is the lowering it specifies, and the compiler takes over once you
                edit.
              </span>
            )
            : source !== "efx"
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
