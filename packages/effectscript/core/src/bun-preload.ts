/**
 * `effectscript/bun-preload`: registers the EffectScript Bun plugin. Use it from bunfig.toml
 * (`preload = ["effectscript/bun-preload"]`) or `bun --preload effectscript/bun-preload …`.
 *
 * @since 4.0.0
 */
import { efx } from "./bun.ts"

declare const Bun: { readonly plugin: (plugin: unknown) => void }

Bun.plugin(efx())
