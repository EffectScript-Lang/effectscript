/**
 * EffectScript compiler: `.efx` → idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 */

/**
 * @since 0.1.0
 * @category compiler
 */
export const toTypeScript = (source: string): { readonly code: string } => ({ code: source })
