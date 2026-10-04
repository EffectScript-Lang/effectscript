/**
 * The landing page's scenes (ADR-0082). Each one draws an idea the room next to it explains:
 * ceremony resolving into one line, the film's light, the token count, Effect's A, E and R merging
 * into one type, and two versions turning in lockstep. The line (ADR-0091) draws the rest.
 */
import { effect, sampler, texture } from "vgpu"
import ceremonyShader from "../shaders/ceremony.wgsl"
import channelsShader from "../shaders/channels.wgsl"
import lockstepShader from "../shaders/lockstep.wgsl"
import theaterShader from "../shaders/theater.wgsl"
import tokensShader from "../shaders/tokens.wgsl"
import type { SceneContext, SceneFactory } from "./runtime.ts"

/** The text sheet's line pitch, in sheet pixels; `ceremony.wgsl` reads rows at the same pitch. */
const pitch = 20

/**
 * The Effect TypeScript the strands are made of, set in JetBrains Mono on a canvas: one line per
 * row, repeated along the row so a strand never runs out of text.
 */
const textSheet = async (lines: ReadonlyArray<string>): Promise<HTMLCanvasElement> => {
  await document.fonts.load("500 15px 'JetBrains Mono'")
  const canvas = document.createElement("canvas")
  canvas.width = 2400
  canvas.height = Math.max(1, lines.length) * pitch
  const context = canvas.getContext("2d")!
  context.fillStyle = "#000"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#fff"
  context.font = "500 15px 'JetBrains Mono', monospace"
  context.textBaseline = "middle"
  for (const [i, line] of lines.entries()) {
    const width = context.measureText(`${line}   `).width
    for (let x = 4; x < canvas.width; x += width) context.fillText(line, x, i * pitch + pitch / 2)
  }
  return canvas
}

/**
 * A signal colour (ADR-0078) as linear-ish RGBA for a shader, read from the page's CSS tokens so the
 * scenes and the markup can't disagree.
 */
const signal = (name: "pass" | "fail" | "warn" | "need"): [number, number, number, number] => {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(`--efx-${name}`).trim().replace("#", "")
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255
  return hex.length === 6 ? [channel(0), channel(2), channel(4), 1] : [1, 1, 1, 1]
}

/** A scene whose uniforms are its size and the time, plus fixed values from the element. */
const simple = (
  shader: Parameters<typeof effect>[1],
  fixed: (element: HTMLElement) => Record<string, number | ReadonlyArray<number>> = () => ({})
): SceneFactory =>
({ element, gpu, surface }) => {
  const fx = effect(gpu, shader, {
    label: element.dataset.scene ?? "scene",
    set: { params: { resolution: surface.size, time: 0, ...fixed(element) } }
  })
  surface.onResize(({ height, width }) => fx.set({ params: { resolution: [width, height] } }))
  return {
    draw: (frame, time) => {
      fx.set({ params: { time } })
      frame.pass(surface, fx)
    }
  }
}

const ceremony: SceneFactory = async ({ element, gpu, pointer, still, surface }: SceneContext) => {
  const lines = JSON.parse(element.dataset.sheet ?? "[]") as Array<string>
  const sheet = await textSheet(lines)
  const sheetTexture = texture(gpu, {
    kind: "2d",
    size: [sheet.width, sheet.height],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst", "render_attachment"],
    label: "ceremony sheet"
  })
  gpu.gpu.queue.copyExternalImageToTexture({ source: sheet }, { texture: sheetTexture.gpu }, [
    sheet.width,
    sheet.height
  ])
  const tangle = Number(element.dataset.tangle ?? "1")
  const fx = effect(gpu, ceremonyShader, {
    label: "ceremony",
    set: {
      params: {
        resolution: surface.size,
        pointer: [-1e4, -1e4],
        time: 0,
        tangle,
        beamY: Number(element.dataset.beamY === "auto" ? "0.64" : element.dataset.beamY ?? "0.64"),
        converge: Number(element.dataset.converge ?? "0.68"),
        textScale: surface.dpr,
        intro: still ? 1 : 0,
        clear: 0
      },
      sheet: sheetTexture,
      samp: sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "repeat", addressModeV: "repeat" })
    }
  })
  // "auto" puts the beam just below the element marked `data-beam-anchor`, so the strands never
  // run through the copy, whatever the viewport's shape
  const anchor = element.dataset.beamY === "auto" ? element.parentElement?.querySelector("[data-beam-anchor]") : null
  /** Where the copy ends, as a fraction of the scene's height (0 without an anchor). */
  const clear = () => {
    const box = element.getBoundingClientRect()
    const below = anchor?.getBoundingClientRect()
    return below === undefined || box.height === 0 ? 0 : (below.bottom - box.top) / box.height
  }
  const beamY = (copy: number) => copy === 0 ? 0.64 : Math.min(0.88, Math.max(0.56, copy + 0.055))
  surface.onResize(({ dpr, height, width }) => fx.set({ params: { resolution: [width, height], textScale: dpr } }))
  // the pointer's influence eases in and out, so the tangle settles back when it leaves
  let influence = 0
  // the copy settles after fonts and entrances, so the beam follows it for a while
  let frames = 0
  return {
    draw: (frame, time) => {
      influence += ((pointer.active ? 1 : 0) - influence) * 0.06
      const away = -1e4
      const follow = anchor !== null && anchor !== undefined && frames++ % 15 === 0
      const copy = follow ? clear() : 0
      fx.set({
        params: {
          time: time + 3,
          intro: still ? 1 : Math.min(1, time / 2.4),
          pointer: influence > 0.01 ? [pointer.x, pointer.y + (1 - influence) * 600] : [away, away],
          ...(follow ? { beamY: beamY(copy), clear: copy } : {})
        }
      })
      frame.pass(surface, fx)
    }
  }
}

const tokens: SceneFactory = ({ element, gpu, still, surface }) => {
  const fx = effect(gpu, tokensShader, {
    label: "tokens",
    set: {
      params: {
        resolution: surface.size,
        before: Number(element.dataset.before),
        after: Number(element.dataset.after),
        time: 0,
        progress: still ? 1 : 0
      }
    }
  })
  surface.onResize(({ height, width }) => fx.set({ params: { resolution: [width, height] } }))
  return {
    draw: (frame, time) => {
      // the lit cells fill in once, in reading order, the first time the room is seen
      const progress = still ? 1 : 1 - (1 - Math.min(1, time / 2.2)) ** 3
      fx.set({ params: { time, progress } })
      frame.pass(surface, fx)
    }
  }
}

export const factories: Record<string, SceneFactory> = {
  ceremony,
  tokens,
  theater: simple(theaterShader, () => ({ intensity: 1 })),
  lockstep: simple(lockstepShader, () => ({ pad: 0 })),
  channels: simple(channelsShader, (element) => ({
    merge: Number(element.dataset.merge ?? "0.58"),
    passColor: signal("pass"),
    failColor: signal("fail"),
    needColor: signal("need")
  }))
}
