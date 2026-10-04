/**
 * The landing page's WebGPU scenes (ADR-0082), drawn with vgpu: one device for every canvas, one
 * frame loop, and only the scenes near the viewport draw. Each canvas sits over a poster image;
 * it fades in after its first frame, so a browser without WebGPU keeps the posters.
 */
import { frameLoop, init, surface } from "vgpu"
import type { Frame, Gpu, Surface } from "vgpu"

/** A scene's pointer, in device pixels of its canvas; `active` is false while it is elsewhere. */
export interface Pointer {
  x: number
  y: number
  active: boolean
}

export interface SceneContext {
  readonly gpu: Gpu
  readonly surface: Surface
  readonly element: HTMLElement
  readonly pointer: Pointer
  /** True when the visitor asked for reduced motion: the scene draws one still frame. */
  readonly still: boolean
}

export interface Scene {
  /** Draws a frame. `time` is in seconds since the scene first became visible. */
  readonly draw: (frame: Frame, time: number) => void
}

export type SceneFactory = (context: SceneContext) => Scene | Promise<Scene>

interface Running {
  readonly element: HTMLElement
  readonly canvas: HTMLCanvasElement
  readonly surface: Surface
  readonly scene: Scene
  visible: boolean
  started: number | undefined
  drawnStill: boolean
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The time a still frame is drawn at, per scene, so the still shows the idea mid-motion. */
const stillTime = (element: HTMLElement) => Number(element.dataset.stillTime ?? "4")

export const start = async (factories: Readonly<Record<string, SceneFactory>>): Promise<void> => {
  const elements = [...document.querySelectorAll<HTMLElement>("[data-scene]")]
  if (elements.length === 0 || !("gpu" in navigator)) return
  let gpu: Gpu
  try {
    gpu = await init({ powerPreference: "high-performance" })
  } catch {
    return
  }
  const still = reducedMotion()
  const running: Array<Running> = []
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const scene = running.find((r) => r.element === entry.target)
        if (scene !== undefined) scene.visible = entry.isIntersecting
      }
    },
    { rootMargin: "160px 0px" }
  )
  for (const element of elements) {
    const factory = factories[element.dataset.scene ?? ""]
    const canvas = element.querySelector("canvas")
    if (factory === undefined || canvas === null) continue
    const max = Number(element.dataset.dpr ?? "1.5")
    const target = surface(gpu, canvas, { dpr: [1, Math.min(max, window.devicePixelRatio || 1)] })
    const pointer: Pointer = { x: 0, y: 0, active: false }
    if (element.dataset.pointer !== undefined) {
      const area = element.closest<HTMLElement>("[data-pointer-area]") ?? element
      area.addEventListener("pointermove", (event) => {
        const box = canvas.getBoundingClientRect()
        pointer.x = (event.clientX - box.left) * target.dpr
        pointer.y = (event.clientY - box.top) * target.dpr
        pointer.active = true
      })
      area.addEventListener("pointerleave", () => {
        pointer.active = false
      })
    }
    try {
      const scene = await factory({ gpu, surface: target, element, pointer, still })
      const entry: Running = {
        element,
        canvas,
        surface: target,
        scene,
        visible: false,
        started: undefined,
        drawnStill: false
      }
      running.push(entry)
      // a resize clears the canvas, so a still scene draws again
      target.onResize(() => {
        if (still) entry.drawnStill = false
      })
      observer.observe(element)
    } catch (error) {
      // a scene that can't start keeps its poster; say why in the console
      // oxlint-disable-next-line no-console
      console.warn(`scene ${element.dataset.scene} failed`, error)
    }
  }
  frameLoop(gpu, (frame) => {
    const now = performance.now() / 1000
    for (const r of running) {
      if (!r.visible || (still && r.drawnStill)) continue
      r.started ??= now
      r.scene.draw(frame, still ? stillTime(r.element) : now - r.started)
      if (!r.drawnStill) {
        r.drawnStill = true
        r.element.classList.add("is-live")
      }
    }
  })
}
