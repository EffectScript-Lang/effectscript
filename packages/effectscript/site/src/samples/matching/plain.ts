export type Shape =
  | { readonly _tag: "Circle"; readonly radius: number }
  | { readonly _tag: "Square"; readonly side: number }
  | { readonly _tag: "Rectangle"; readonly width: number; readonly height: number }

export function area(shape: Shape): number {
  switch (shape._tag) {
    case "Circle":
      return Math.PI * shape.radius ** 2
    case "Square":
      return shape.side ** 2
    case "Rectangle":
      return shape.width * shape.height
    default: {
      const unreachable: never = shape
      throw new Error(`unknown shape ${JSON.stringify(unreachable)}`)
    }
  }
}
