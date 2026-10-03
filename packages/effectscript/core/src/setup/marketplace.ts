/**
 * The VS Code Marketplace's form of an EffectScript version (ADR-0055), so `efx setup` knows which
 * extension version this `efx` carries. The same mapping packages the extension
 * (`vscode/scripts/marketplace.ts`; a test keeps the two equal).
 *
 * @since 4.0.0
 */

/**
 * `x.y.z-alpha.N` → `x.y.(z·1000+N)` (a pre-release), `x.y.z` → `x.y.(z·1000+999)`.
 *
 * @since 4.0.0
 * @category setup
 */
export const marketplaceVersion = (version: string): { readonly version: string; readonly preRelease: boolean } => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-alpha\.(\d+))?$/.exec(version)
  if (match === null) throw new Error(`${version} is not x.y.z or x.y.z-alpha.N`)
  const [, major, minor, patch, alpha] = match
  if (alpha !== undefined && Number(alpha) >= 999) throw new Error(`alpha.${alpha} doesn't fit below 999`)
  const number = Number(patch) * 1000 + (alpha === undefined ? 999 : Number(alpha))
  return { version: `${major}.${minor}.${number}`, preRelease: alpha !== undefined }
}
