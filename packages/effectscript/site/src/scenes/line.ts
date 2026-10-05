/**
 * The line (ADR-0091): one line that draws itself down the landing page as you scroll. It leaves
 * the hero's beam, runs down a spine in the left gutter, and in each room swings out to become that
 * room's diagram (a frame, a tangle that straightens, an error rail, retries, fibers, a pipeline,
 * a ring) before it returns. Each room draws its own part, in its own coordinates, from the places
 * its markup marks, so the line follows the layout at every width.
 *
 * Progressive: without script the page is complete; with reduced motion the line is drawn whole.
 */

type Tone = "pass" | "fail" | "warn" | "need" | "ghost"

interface Box {
  readonly l: number
  readonly t: number
  readonly r: number
  readonly b: number
  readonly w: number
  readonly h: number
  readonly cx: number
  readonly cy: number
}

interface Context {
  readonly room: HTMLElement
  readonly w: number
  readonly h: number
  /** The spine's x, in the left gutter. */
  readonly spine: number
  readonly narrow: boolean
  /** An element's box in the room's coordinates. */
  readonly box: (element: Element | null | undefined) => Box | undefined
  readonly one: (selector: string) => Box | undefined
  readonly all: (selector: string) => ReadonlyArray<Box>
  /** The box of some text inside an element: a code token, for a leader line. */
  readonly text: (container: Element | null, needle: string) => Box | undefined
}

/** A path that leaves the main line where it passes nearest to its own start. */
interface Branch {
  readonly d: string
  readonly tone?: Tone | undefined
  readonly dashed?: boolean | undefined
  /** An extension's arc, lit when that extension is switched on. */
  readonly ext?: string | undefined
}

interface Mark {
  readonly x: number
  readonly y: number
  readonly r?: number | undefined
  readonly tone?: Tone | undefined
  readonly label?: string | undefined
  readonly anchor?: "start" | "middle" | "end" | undefined
  /** The label's offset from the point. */
  readonly dy?: number | undefined
  readonly dot?: boolean | undefined
  readonly station?: string | undefined
  /** The gallery's open scenario. */
  readonly here?: boolean | undefined
}

interface Drawing {
  readonly d: string
  readonly branches?: ReadonlyArray<Branch>
  readonly marks?: ReadonlyArray<Mark>
  /** The page's last room: its line ends in a terminus instead of running on. */
  readonly end?: boolean
}

const n = (value: number) => Math.round(value * 10) / 10

/** Straight down the spine: rooms whose stage is pinned, and every room on a phone. */
const spine = (c: Context): Drawing => ({ d: `M ${n(c.spine)} 0 V ${n(c.h)}` })

/**
 * Out from the spine along `y`, the room's diagram (`inner`, from `x0` to `x1`), and back along
 * `back` to the spine, then down: the shape every stage row shares.
 */
const excursion = (c: Context, y: number, x0: number, inner: string, x1: number, back: number) => {
  const s = n(c.spine)
  const r = 18
  return [
    `M ${s} 0 V ${n(y - r)} Q ${s} ${n(y)} ${n(s + r)} ${n(y)} H ${n(x0)}`,
    inner,
    `L ${n(x1)} ${n(y)} Q ${n(x1 + 28)} ${n(y)} ${n(x1 + 28)} ${n(y + 28)} V ${n(back - r)}`,
    `Q ${n(x1 + 28)} ${n(back)} ${n(x1 + 28 - r)} ${n(back)} H ${n(s + r)} Q ${s} ${n(back)} ${s} ${n(back + r)} V ${
      n(c.h)
    }`
  ].join(" ")
}

/** A loop above the line at `x`: forward, up and round, crossing itself, on again. */
const loop = (x: number, y: number, r: number) =>
  `L ${n(x)} ${n(y)} C ${n(x + 2.2 * r)} ${n(y)} ${n(x + 2.2 * r)} ${n(y - 2 * r)} ${n(x + 1.1 * r)} ${n(y - 2 * r)} ` +
  `C ${n(x)} ${n(y - 2 * r)} ${n(x)} ${n(y)} ${n(x + 2.2 * r)} ${n(y)}`

/** A wavy underline, as an editor draws one under a problem. */
const squiggle = (x0: number, x1: number, y: number) => {
  const parts = [`M ${n(x0)} ${n(y)}`]
  for (let x = x0, up = true; x < x1; x += 4, up = !up) {
    parts.push(`Q ${n(x + 2)} ${n(y + (up ? -2.6 : 2.6))} ${n(x + 4)} ${n(y)}`)
  }
  return parts.join(" ")
}

/** A seeded random, so the tangle is the same tangle on every visit. */
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

const builders: Readonly<Record<string, (c: Context) => Drawing>> = {
  /** The hero's beam leaves at the right edge; the line comes back under it and drops to the spine. */
  hero: (c) => {
    const anchor = c.one("[data-beam-anchor]")
    const copy = anchor === undefined ? 0 : anchor.b / c.h
    const y = (copy === 0 ? 0.64 : Math.min(0.88, Math.max(0.56, copy + 0.055))) * c.h
    const s = c.spine
    return {
      d: `M ${n(c.w)} ${n(y)} C ${n(c.w * 0.62)} ${n(y + (c.h - y) * 0.15)}, ${n(s + c.w * 0.08)} ${
        n(y + (c.h - y) * 0.2)
      }, ${n(s)} ${n(y + (c.h - y) * 0.7)} V ${n(c.h)}`
    }
  },
  /** The line frames the film: the spine is its left edge. */
  film: (c) => {
    const screen = c.one(".screen")
    if (screen === undefined) return spine(c)
    const s = n(c.spine)
    const r = 20
    const top = screen.t - 24
    const right = Math.min(c.w - 12, screen.r + 24)
    const bottom = screen.b + 24
    return {
      d: `M ${s} 0 V ${n(top - r)} Q ${s} ${n(top)} ${n(s + r)} ${n(top)} H ${n(right - r)} Q ${n(right)} ${n(top)} ${
        n(right)
      } ${n(top + r)} V ${n(bottom - r)} Q ${n(right)} ${n(bottom)} ${n(right - r)} ${n(bottom)} H ${n(s + r)} Q ${s} ${
        n(bottom)
      } ${s} ${n(bottom + r)} V ${n(c.h)}`,
      marks: [{ x: right, y: top, dot: true }]
    }
  },
  /** Ceremony as a tangle that loosens into a straight line. */
  ledger: (c) => {
    const stage = c.one("[data-line-stage]")
    if (stage === undefined || c.narrow) return spine(c)
    const random = seeded(7)
    const y = stage.cy
    const x0 = stage.l
    const x1 = stage.r - 40
    const knot = x0 + (x1 - x0) * 0.62
    const parts: Array<string> = []
    const marks: Array<Mark> = []
    const words = [...c.room.querySelectorAll<HTMLElement>("[data-ceremony]")].map((e) => e.dataset.ceremony!)
    let x = x0 + 24
    let labelled = 0
    const last = { above: -Infinity, below: -Infinity }
    for (let i = 0; x < knot; i++) {
      // the knot is tight where ceremony starts and loosens towards the plain line
      const left = 1 - (x - x0) / (knot - x0)
      const r = Math.max(2, stage.h * 0.2 * left ** 0.8 * (0.5 + random() * 0.8))
      const flip = random() < 0.55 ? 1 : -1
      const lean = (random() - 0.5) * r * 1.6
      const lift = (random() - 0.5) * r * 0.8 * left
      parts.push(
        `L ${n(x)} ${n(y + lift)} C ${n(x + 2.6 * r)} ${n(y + lift + flip * 0.6 * r)} ${n(x + 2.4 * r + lean)} ${
          n(y - flip * 2.2 * r)
        } ${n(x + 1.2 * r + lean)} ${n(y - flip * 2.2 * r)} C ${n(x - 0.4 * r + lean)} ${n(y - flip * 2.2 * r)} ${
          n(x - 0.2 * r)
        } ${n(y + lift + flip * 0.4 * r)} ${n(x + 2.2 * r)} ${n(y + lift * 0.4)}`
      )
      // the ceremony's words float in two rows above and below the knot, never on top of each other
      const word = words[labelled]
      const row = labelled % 2 === 0 ? "above" : "below"
      const atX = x + 1.2 * r + lean
      if (word !== undefined && atX - last[row] > 130) {
        marks.push({
          x: atX,
          y: row === "above" ? stage.t + 4 : stage.b - 4,
          label: word,
          anchor: "middle",
          dy: 0,
          tone: "ghost"
        })
        last[row] = atX
        labelled++
      }
      // loops overlap while the knot is tight, and spread as it loosens
      x += r * (0.9 + (1 - left) * 1.6) + 4 + random() * 8
    }
    marks.push({ x: x1, y, dot: true, label: "EffectScript", anchor: "end", dy: -14 })
    return { d: excursion(c, y, x0, parts.join(" "), x1, stage.b + 30), marks }
  },
  /** Each async form joined to its EffectScript by a rung. */
  translation: (c) => {
    const rows = [...c.room.querySelectorAll(".pair")]
    const branches: Array<Branch> = []
    for (const row of rows) {
      const from = c.box(row.querySelector(".pair-from"))
      const to = c.box(row.querySelector(".pair-to"))
      if (from === undefined || to === undefined || c.narrow) continue
      const y = from.cy
      const a = from.r + 14
      const b = to.l - 14
      branches.push({
        d: `M ${n(a)} ${n(y)} C ${n(a + (b - a) * 0.5)} ${n(y)} ${n(a + (b - a) * 0.5)} ${n(to.cy)} ${n(b)} ${n(to.cy)}`
      })
      branches.push({ d: `M ${n(b - 6)} ${n(to.cy - 4)} L ${n(b)} ${n(to.cy)} L ${n(b - 6)} ${n(to.cy + 4)}` })
    }
    return { ...spine(c), branches }
  },
  /** Effect's library as one line: an error rail, retries, fibers, layers. */
  stdlib: (c) => {
    const stage = c.one("[data-line-stage]")
    if (stage === undefined || c.narrow) return spine(c)
    const y = stage.t + stage.h * 0.46
    const x0 = stage.l
    const x1 = stage.r - 40
    const at = (f: number) => x0 + (x1 - x0) * f
    const r = Math.min(36, stage.h * 0.17)
    const label = stage.b - 4
    // the error rail: a failure leaves the success line, and stays apart from it
    const fork = at(0.07)
    const rail: Branch = {
      d: `M ${n(fork)} ${n(y)} C ${n(fork + 60)} ${n(y)} ${n(fork + 70)} ${n(y + stage.h * 0.26)} ${n(fork + 140)} ${
        n(y + stage.h * 0.26)
      } H ${n(at(0.2))}`,
      tone: "fail",
      dashed: true
    }
    // three attempts: two fail, the third goes through
    const retries = [0.27, 0.32, 0.37].map((f) => loop(at(f), y, r)).join(" ")
    // fibers: the line forks four ways and joins
    const f0 = at(0.47)
    const f1 = at(0.66)
    const fiber = (dy: number) => ({
      d: `M ${n(f0)} ${n(y)} C ${n(f0 + 50)} ${n(y)} ${n(f0 + 40)} ${n(y + dy)} ${n(f0 + 100)} ${n(y + dy)} H ${
        n(f1 - 100)
      } C ${n(f1 - 40)} ${n(y + dy)} ${n(f1 - 50)} ${n(y)} ${n(f1)} ${n(y)}`
    })
    const h = stage.h
    // layers: services provided under the line
    const l0 = at(0.76)
    const layers: Array<Branch> = [
      { d: `M ${n((l0 + at(0.94)) / 2)} ${n(y + h * 0.16)} V ${n(y + 4)}`, tone: "need" },
      ...[0.16, 0.27, 0.38].map((dy, i): Branch => ({
        d: `M ${n(l0 + i * 18)} ${n(y + h * dy)} H ${n(at(0.94) - i * 18)}`,
        tone: "need"
      }))
    ]
    return {
      d: excursion(
        c,
        y,
        x0,
        `L ${n(at(0.25))} ${n(y)} ${retries} L ${n(f0)} ${n(y)} L ${n(x1)} ${n(y)}`,
        x1,
        stage.b + 34
      ),
      branches: [rail, fiber(-h * 0.3), fiber(-h * 0.15), fiber(h * 0.18), ...layers],
      marks: [
        { x: at(0.2), y: y + h * 0.26, dot: true, tone: "fail" },
        { x: at(0.12), y: label, label: "! typed errors", tone: "fail", anchor: "middle" },
        { x: at(0.28) + 1.1 * r, y: y - 2 * r, dot: true, tone: "fail" },
        { x: at(0.33) + 1.1 * r, y: y - 2 * r, dot: true, tone: "fail" },
        { x: at(0.38) + 1.1 * r, y: y - 2 * r, dot: true, tone: "pass" },
        { x: at(0.33), y: label, label: "retries", anchor: "middle" },
        { x: (f0 + f1) / 2, y: label, label: "concurrency", anchor: "middle" },
        { x: at(0.85), y: label, label: "◇ layers", tone: "need", anchor: "middle" },
        { x: x1, y, dot: true, tone: "pass", label: "✓", anchor: "end", dy: -12 }
      ]
    }
  },
  /** The gallery's scenarios as stations on a line. */
  gallery: (c) => {
    const tabs = c.all(".scenario-tab")
    if (tabs.length === 0 || c.narrow) return spine(c)
    const top = Math.min(...tabs.map((t) => t.t))
    const y = top - 30
    const panel = c.one("[data-scenario-panel]:not([hidden])")
    const right = Math.min(c.w - 14, (panel?.r ?? Math.max(...tabs.map((t) => t.r))) + 26)
    const bottom = (panel?.b ?? top + 60) + 26
    const s = n(c.spine)
    const r = 20
    const marks: Array<Mark> = [...c.room.querySelectorAll<HTMLElement>(".scenario-tab")].map((tab) => {
      const t = c.box(tab)!
      return {
        x: t.cx,
        y: t.t < top + 4 ? y : t.t - 12,
        r: 4,
        station: tab.dataset.scenario,
        dot: true,
        here: tab.getAttribute("aria-selected") === "true"
      }
    })
    return {
      d: `M ${s} 0 V ${n(y - r)} Q ${s} ${n(y)} ${n(s + r)} ${n(y)} H ${n(right - r)} Q ${n(right)} ${n(y)} ${
        n(right)
      } ${n(y + r)} V ${n(bottom - r)} Q ${n(right)} ${n(bottom)} ${n(right - r)} ${n(bottom)} H ${n(s + r)} Q ${s} ${
        n(bottom)
      } ${s} ${n(bottom + r)} V ${n(c.h)}`,
      marks
    }
  },
  /** Leader lines from each note to the code it explains. */
  intent: (c) => {
    const code = c.room.querySelector(".annotated pre")
    const lines = c.all(".annotated .line")
    const branches: Array<Branch> = []
    const marks: Array<Mark> = []
    for (const note of c.room.querySelectorAll<HTMLElement>(".notes [data-find]")) {
      const target = c.text(code, note.dataset.find!)
      const from = c.box(note)
      if (target === undefined || from === undefined || c.narrow) continue
      const tone = note.dataset.tone as Tone | undefined
      const pre = c.box(code)!
      const x0 = from.l - 12
      const y0 = from.t + from.h / 2
      const elbow = pre.r + 22
      // the code line the token is on: the leader stops where its text ends, never crossing it
      const line = lines.find((l) => l.t <= target.cy && target.cy <= l.b)
      const stop = (line?.r ?? target.r) + 14
      const p = 4
      branches.push({ d: `M ${n(x0)} ${n(y0)} H ${n(elbow + 14)} L ${n(elbow)} ${n(target.cy)} H ${n(stop)}`, tone })
      branches.push({
        d: `M ${n(target.l - p + 4)} ${n(target.t - 1)} H ${n(target.r + p - 4)} Q ${n(target.r + p)} ${
          n(target.t - 1)
        } ${n(target.r + p)} ${n(target.t + 3)} V ${n(target.b - 3)} Q ${n(target.r + p)} ${n(target.b + 1)} ${
          n(target.r + p - 4)
        } ${n(target.b + 1)} H ${n(target.l - p + 4)} Q ${n(target.l - p)} ${n(target.b + 1)} ${n(target.l - p)} ${
          n(target.b - 3)
        } V ${n(target.t + 3)} Q ${n(target.l - p)} ${n(target.t - 1)} ${n(target.l - p + 4)} ${n(target.t - 1)}`,
        tone
      })
      marks.push({ x: x0, y: y0, r: 2.5, dot: true, tone }, { x: stop, y: target.cy, r: 2.5, dot: true, tone })
    }
    return { ...spine(c), branches, marks }
  },
  /** The tokens as two tapes: Effect TypeScript's, and the shorter one EffectScript leaves. */
  agents: (c) => {
    const stage = c.one("[data-line-stage]")
    if (stage === undefined || c.narrow) return spine(c)
    const ratio = Number(c.room.dataset.ratio ?? "0.5")
    const x0 = stage.l
    const x1 = stage.r - 40
    const ghost = stage.t + stage.h * 0.3
    const y = stage.t + stage.h * 0.72
    const end = x0 + (x1 - x0) * ratio
    return {
      d: excursion(c, y, x0, `L ${n(end)} ${n(y)}`, end, stage.b + 30),
      branches: [{ d: `M ${n(x0)} ${n(ghost)} H ${n(x1)}`, tone: "ghost", dashed: true }],
      marks: [
        { x: x1, y: ghost, dot: true, tone: "ghost", label: c.room.dataset.before, anchor: "end", dy: -14 },
        { x: end, y, dot: true, label: c.room.dataset.after, anchor: "end", dy: -14 }
      ]
    }
  },
  /** The pipeline: .efx to .ts to .js, and the wasm blob it never needs. */
  output: (c) => {
    const stage = c.one("[data-line-stage]")
    if (stage === undefined || c.narrow) return spine(c)
    const y = stage.t + stage.h * 0.4
    const x0 = stage.l
    const x1 = stage.r - 40
    const at = (f: number) => x0 + (x1 - x0) * f
    const files = [...c.room.querySelectorAll<HTMLElement>("[data-node]")].map((e) => e.dataset.node!)
    const dead = at(0.36)
    return {
      d: excursion(c, y, x0, `L ${n(x1)} ${n(y)}`, x1, stage.b + 30),
      branches: [
        {
          d: `M ${n(at(0.2))} ${n(y)} C ${n(at(0.26))} ${n(y)} ${n(at(0.27))} ${n(y + stage.h * 0.36)} ${n(dead)} ${
            n(y + stage.h * 0.36)
          }`,
          tone: "ghost",
          dashed: true
        },
        {
          d: `M ${n(dead + 6)} ${n(y + stage.h * 0.36 - 6)} L ${n(dead + 18)} ${n(y + stage.h * 0.36 + 6)} M ${
            n(dead + 18)
          } ${n(y + stage.h * 0.36 - 6)} L ${n(dead + 6)} ${n(y + stage.h * 0.36 + 6)}`,
          tone: "ghost"
        }
      ],
      marks: [
        ...files.map((file, i): Mark => ({
          x: at(0.2 + i * 0.3),
          y,
          r: 7,
          dot: true,
          label: file,
          anchor: "middle",
          dy: -22
        })),
        { x: dead + 30, y: y + stage.h * 0.36, label: "no wasm", anchor: "start", dy: 4, tone: "ghost" }
      ]
    }
  },
  /** A squiggle under each line the compiler flags, as an editor draws it. */
  strict: (c) => {
    const branches: Array<Branch> = []
    for (const card of c.room.querySelectorAll<HTMLElement>(".diagnostic")) {
      const lines = [...card.querySelectorAll(".code-block .line")]
      for (const flag of (card.dataset.flags ?? "").split(" ").filter(Boolean)) {
        const [line, severity] = flag.split(":") as [string, string]
        const box = c.box(lines[Number(line) - 1])
        const text = lines[Number(line) - 1]?.textContent ?? ""
        if (box === undefined) continue
        const indent = text.length - text.trimStart().length
        const chars = text.trimEnd().length
        const width = box.w / Math.max(1, chars)
        branches.push({
          d: squiggle(box.l + indent * width, box.l + chars * width, box.b + 1),
          tone: severity === "error" ? "fail" : "warn"
        })
      }
    }
    return { ...spine(c), branches }
  },
  /** Extensions as arcs of one ring: none overlaps another. */
  extensions: (c) => {
    const stage = c.one("[data-line-stage]")
    if (stage === undefined || c.narrow) return spine(c)
    const cx = stage.cx
    const cy = stage.cy
    const R = Math.min(stage.w, stage.h) * 0.36
    const s = c.spine
    const d = `M ${n(s)} 0 V ${n(cy - 18)} Q ${n(s)} ${n(cy)} ${n(s + 18)} ${n(cy)} H ${n(cx - R)} ` +
      `A ${n(R)} ${n(R)} 0 1 1 ${n(cx + R)} ${n(cy)} A ${n(R)} ${n(R)} 0 1 1 ${n(cx - R)} ${n(cy)} ` +
      `C ${n(cx - R - 70)} ${n(cy + 10)} ${n(s + 20)} ${n(cy + 40)} ${n(s)} ${n(cy + 110)} V ${n(c.h)}`
    const ids = [...c.room.querySelectorAll<HTMLElement>(".ext-card")].map((e) => e.dataset.ext!)
    const arc = (from: number, to: number) => {
      const a = (
        deg: number
      ) => [cx + (R + 16) * Math.cos((deg * Math.PI) / 180), cy + (R + 16) * Math.sin((deg * Math.PI) / 180)]
      const [ax, ay] = a(from)
      const [bx, by] = a(to)
      return `M ${n(ax!)} ${n(ay!)} A ${n(R + 16)} ${n(R + 16)} 0 0 1 ${n(bx!)} ${n(by!)}`
    }
    const span = 360 / Math.max(1, ids.length)
    return {
      d,
      branches: ids.map((id, i) => ({ d: arc(-90 + i * span + 8, -90 + (i + 1) * span - 8), ext: id })),
      marks: ids.map((id, i) => {
        const mid = ((-90 + (i + 0.5) * span) * Math.PI) / 180
        return {
          x: cx + (R + 38) * Math.cos(mid),
          y: cy + (R + 38) * Math.sin(mid),
          label: id,
          anchor: Math.cos(mid) < -0.2 ? "end" : Math.cos(mid) > 0.2 ? "start" : "middle",
          dy: 4,
          tone: "ghost"
        }
      })
    }
  },
  /** TypeScript inside EffectScript. */
  superset: (c) => {
    const stage = c.one("[data-line-stage]")
    if (stage === undefined || c.narrow) return spine(c)
    const size = Math.min(stage.h, stage.w * 0.5) - 20
    const x = stage.l + 30
    const t = stage.cy - size / 2
    const r = 28
    const inner = size * 0.5
    const ix = x + (size - inner) / 2
    const it = t + (size - inner) / 2
    const s = c.spine
    const d =
      `M ${n(s)} 0 V ${n(t + size / 2 - 18)} Q ${n(s)} ${n(t + size / 2)} ${n(s + 18)} ${n(t + size / 2)} H ${n(x)} ` +
      `V ${n(t + r)} Q ${n(x)} ${n(t)} ${n(x + r)} ${n(t)} H ${n(x + size - r)} Q ${n(x + size)} ${n(t)} ${
        n(x + size)
      } ${n(t + r)} ` +
      `V ${n(t + size - r)} Q ${n(x + size)} ${n(t + size)} ${n(x + size - r)} ${n(t + size)} H ${n(x + r)} Q ${n(x)} ${
        n(t + size)
      } ${n(x)} ${n(t + size - r)} V ${n(t + size / 2)} ` +
      `C ${n(x - 30)} ${n(t + size / 2 + 40)} ${n(s + 20)} ${n(t + size)} ${n(s)} ${n(t + size + 40)} V ${n(c.h)}`
    return {
      d,
      branches: [{
        d: `M ${n(ix)} ${n(it + 16)} Q ${n(ix)} ${n(it)} ${n(ix + 16)} ${n(it)} H ${n(ix + inner - 16)} Q ${
          n(ix + inner)
        } ${n(it)} ${n(ix + inner)} ${n(it + 16)} V ${n(it + inner - 16)} Q ${n(ix + inner)} ${n(it + inner)} ${
          n(ix + inner - 16)
        } ${n(it + inner)} H ${n(ix + 16)} Q ${n(ix)} ${n(it + inner)} ${n(ix)} ${n(it + inner - 16)} Z`,
        tone: "ghost"
      }],
      marks: [
        { x: x + 20, y: t + 30, label: ".efx", anchor: "start", dy: 0 },
        { x: ix + inner / 2, y: it + inner / 2, label: ".ts", anchor: "middle", dy: 5, tone: "ghost" }
      ]
    }
  },
  /** The line belts the two dials, turning together. */
  lockstep: (c) => {
    const dial = c.one(".dial canvas, .dial img")
    if (dial === undefined || c.narrow) return spine(c)
    const R = Math.max(dial.w, dial.h) / 2 + 18
    const s = c.spine
    const { cx, cy } = dial
    return {
      d: `M ${n(s)} 0 V ${n(cy - 18)} Q ${n(s)} ${n(cy)} ${n(s + 18)} ${n(cy)} H ${n(cx - R)} ` +
        `A ${n(R)} ${n(R)} 0 1 1 ${n(cx + R)} ${n(cy)} A ${n(R)} ${n(R)} 0 1 1 ${n(cx - R)} ${n(cy)} ` +
        `C ${n(cx - R - 40)} ${n(cy)} ${n(s + 30)} ${n(cy + R)} ${n(s)} ${n(cy + R + 60)} V ${n(c.h)}`
    }
  },
  /** The line underlines the last words, and ends there. */
  start: (c) => {
    const dim = c.one("#start-title .dim")
    if (dim === undefined) return spine(c)
    const s = c.spine
    const y = dim.b + 12
    const end = dim.r + 8
    return {
      d: `M ${n(s)} 0 V ${n(y - 18)} Q ${n(s)} ${n(y)} ${n(s + 18)} ${n(y)} H ${n(dim.l)} C ${
        n(dim.l + dim.w * 0.45)
      } ${n(y + 7)} ${n(dim.l + dim.w * 0.8)} ${n(y - 2)} ${n(end)} ${n(y - 8)}`,
      marks: [{ x: end, y: y - 8, r: 5, dot: true }],
      end: true
    }
  },
  spine
}

const svg = "http://www.w3.org/2000/svg"
const make = <K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>) => {
  const element = document.createElementNS(svg, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  return element
}

interface Drawn {
  readonly room: HTMLElement
  readonly layer: SVGSVGElement
  readonly main: SVGPathElement
  readonly glow: SVGPathElement
  readonly pen: SVGGElement
  readonly length: number
  /** Samples along the main path: the length, the lowest y reached so far, and the point. */
  readonly samples: ReadonlyArray<readonly [length: number, lowest: number, x: number, y: number]>
  /** A dashed branch fades in as the pen reaches it; a solid one draws along with it. */
  readonly branches: ReadonlyArray<
    { readonly el: SVGPathElement; readonly start: number; readonly length: number; readonly fade: boolean }
  >
  readonly marks: ReadonlyArray<{ readonly el: SVGGElement; readonly at: number }>
  readonly end: boolean
}

/** Starts the line for every `[data-line]` room on the page. */
export const startLine = () => {
  const rooms = [...document.querySelectorAll<HTMLElement>("[data-line]")]
  if (rooms.length === 0) return
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches
  let drawn: Array<Drawn | undefined> = []

  const build = (room: HTMLElement): Drawn | undefined => {
    room.querySelector(":scope > .line-svg")?.remove()
    const frame = room.getBoundingClientRect()
    if (frame.width === 0 || frame.height === 0) return undefined
    const wrap = document.querySelector<HTMLElement>(".wrap")
    const gutter = wrap === null ? 24 : Number.parseFloat(getComputedStyle(wrap).paddingLeft)
    const left = wrap === null ? 0 : Math.max(0, wrap.getBoundingClientRect().left)
    const box = (element: Element | null | undefined): Box | undefined => {
      if (element === null || element === undefined) return undefined
      const r = element.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return undefined
      const l = r.left - frame.left
      const t = r.top - frame.top
      return {
        l,
        t,
        r: l + r.width,
        b: t + r.height,
        w: r.width,
        h: r.height,
        cx: l + r.width / 2,
        cy: t + r.height / 2
      }
    }
    const context: Context = {
      room,
      w: frame.width,
      h: frame.height,
      spine: Math.max(8, left + gutter * 0.44),
      narrow: frame.width < 900,
      box,
      one: (selector) => box(room.querySelector(selector)),
      all: (selector) =>
        [...room.querySelectorAll(selector)].map((e) => box(e)).filter((b): b is Box => b !== undefined),
      text: (container, needle) => {
        if (container === null) return undefined
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
        const nodes: Array<Text> = []
        let all = ""
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          nodes.push(node as Text)
          all += node.textContent
        }
        const at = all.indexOf(needle)
        if (at === -1) return undefined
        const range = document.createRange()
        const end = at + needle.length
        let offset = 0
        let started = false
        for (const node of nodes) {
          const length = node.data.length
          if (!started && at < offset + length) {
            range.setStart(node, at - offset)
            started = true
          }
          if (started && end <= offset + length) {
            range.setEnd(node, end - offset)
            break
          }
          offset += length
        }
        return box(range as unknown as Element)
      }
    }
    const drawing = (builders[room.dataset.line!] ?? spine)(context)
    const layer = make("svg", { class: "line-svg", "aria-hidden": "true", width: frame.width, height: frame.height })
    const glow = make("path", { d: drawing.d, class: "line-glow" })
    const main = make("path", { d: drawing.d, class: "line-core" })
    layer.append(glow, main)
    room.prepend(layer)
    const length = main.getTotalLength()
    const samples: Array<readonly [number, number, number, number]> = []
    let lowest = -Infinity
    for (let s = 0; s <= length; s += 6) {
      const p = main.getPointAtLength(s)
      lowest = Math.max(lowest, p.y)
      samples.push([s, lowest, p.x, p.y])
    }
    // where on the main line a point is nearest: when a branch or a mark should appear
    const nearest = (x: number, y: number) => {
      let best = 0
      let distance = Infinity
      for (const [s, , px, py] of samples) {
        const dd = (px - x) ** 2 + (py - y) ** 2
        if (dd < distance) {
          distance = dd
          best = s
        }
      }
      return best
    }
    const branches = (drawing.branches ?? []).map((b) => {
      const el = make("path", {
        d: b.d,
        class: `line-branch${b.tone === undefined ? "" : ` ${b.tone}`}${b.dashed === true ? " dashed" : ""}`,
        ...(b.ext === undefined ? {} : { "data-ext": b.ext })
      })
      layer.append(el)
      const start = el.getPointAtLength(0)
      return { el, start: nearest(start.x, start.y), length: el.getTotalLength(), fade: b.dashed === true }
    })
    const marks = (drawing.marks ?? []).map((m) => {
      const g = make("g", {
        class: `line-mark${m.tone === undefined ? "" : ` ${m.tone}`}${m.here === true ? " here" : ""}`,
        ...(m.station === undefined ? {} : { "data-station": m.station })
      })
      if (m.dot === true) g.append(make("circle", { cx: n(m.x), cy: n(m.y), r: m.r ?? 4 }))
      if (m.label !== undefined) {
        const text = make("text", { x: n(m.x), y: n(m.y + (m.dy ?? 18)), "text-anchor": m.anchor ?? "start" })
        text.textContent = m.label
        g.append(text)
      }
      layer.append(g)
      return { el: g, at: nearest(m.x, m.y) }
    })
    const pen = make("g", { class: "line-pen" })
    pen.append(make("circle", { r: 16, class: "line-pen-halo" }), make("circle", { r: 3.2 }))
    layer.append(pen)
    for (const path of [main, glow]) path.style.strokeDasharray = `${length} ${length + 1}`
    for (const b of branches) if (!b.fade) b.el.style.strokeDasharray = `${b.length} ${b.length + 1}`
    return { room, layer, main, glow, pen, length, samples, branches, marks, end: drawing.end === true }
  }

  /** Draws a room's line up to `pen` along it. */
  const paint = (room: Drawn, pen: number) => {
    const shown = Math.max(0, Math.min(room.length, pen))
    for (const path of [room.main, room.glow]) path.style.strokeDashoffset = String(room.length - shown)
    for (const b of room.branches) {
      if (b.fade) b.el.classList.toggle("on", shown >= b.start)
      else {
        // a branch draws quicker than the line, and is always done by the time the line is
        const span = Math.max(40, Math.min(b.length / 1.4, room.length - b.start))
        b.el.style.strokeDashoffset = String(b.length * (1 - Math.max(0, Math.min(1, (shown - b.start) / span))))
      }
    }
    for (const m of room.marks) m.el.classList.toggle("on", shown >= m.at)
    const live = shown > 0 && (shown < room.length || room.end)
    room.pen.style.opacity = live && !still ? "1" : "0"
    if (live) {
      const p = room.main.getPointAtLength(shown)
      room.pen.setAttribute("transform", `translate(${n(p.x)} ${n(p.y)})`)
    }
  }

  let queued = false
  const update = () => {
    queued = false
    const target = innerHeight * 0.62
    for (const room of drawn) {
      if (room === undefined) continue
      if (still) {
        paint(room, room.length)
        continue
      }
      const top = room.room.getBoundingClientRect().top
      const y = target - top
      // the first sample whose lowest y reaches the target: the line keeps pace with the reader
      const { samples } = room
      let lo = 0
      let hi = samples.length - 1
      if (y <= (samples[0]?.[1] ?? 0)) {
        paint(room, 0)
        continue
      }
      if (y >= samples[hi]![1]) {
        paint(room, room.length)
        continue
      }
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (samples[mid]![1] < y) lo = mid + 1
        else hi = mid
      }
      paint(room, samples[lo]![0])
    }
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }

  // one room's drawing failing leaves the others drawn
  const safely = (room: HTMLElement) => {
    try {
      return build(room)
    } catch {
      // the room keeps its content; only its part of the line is missing
      return undefined
    }
  }
  const rebuild = (room: HTMLElement) => {
    drawn[rooms.indexOf(room)] = safely(room)
    schedule()
  }
  const all = () => {
    drawn = rooms.map(safely)
    schedule()
  }
  // a room that changes size (a gallery tab, a reveal, fonts) redraws its own part
  const sized = new ResizeObserver((entries) => {
    for (const entry of entries) rebuild(entry.target as HTMLElement)
  })
  for (const room of rooms) sized.observe(room)
  // reveals slide in: a room measured mid-slide is measured again once its parts have landed
  const settled = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
  addEventListener("transitionend", (event) => {
    const target = event.target
    if (!(target instanceof Element) || !target.classList.contains("reveal")) return
    const room = target.closest<HTMLElement>("[data-line]")
    if (room === null) return
    clearTimeout(settled.get(room))
    settled.set(room, setTimeout(() => rebuild(room), 60))
  })
  addEventListener("scroll", schedule, { passive: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  addEventListener("resize", () => {
    clearTimeout(timer)
    timer = setTimeout(all, 120)
  })
  // the observer draws each room once as it starts; fonts change the layout once more
  void document.fonts.ready.then(all)

  return {
    /** Lights the arcs of the extensions that are on. */
    light: (ext: string, on: boolean) => {
      for (const arc of document.querySelectorAll(`.line-branch[data-ext="${ext}"]`)) arc.classList.toggle("lit", on)
    },
    /** Marks the gallery's open scenario. */
    station: (id: string) => {
      for (const mark of document.querySelectorAll<SVGGElement>(".line-mark[data-station]")) {
        mark.classList.toggle("here", mark.dataset.station === id)
      }
    }
  }
}
