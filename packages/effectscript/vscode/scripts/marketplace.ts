/**
 * The VS Code Marketplace refuses semver prereleases, so the extension's manifest carries a mapped
 * version (ADR-0055): `x.y.z-alpha.N` becomes `x.y.(z * 1000 + N)`, published as a pre-release, and
 * `x.y.z` becomes `x.y.(z * 1000 + 999)`. The order of npm versions is kept.
 */
export const marketplaceVersion = (version: string): { readonly version: string; readonly preRelease: boolean } => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-alpha\.(\d+))?$/.exec(version)
  if (match === null) throw new Error(`${version} is not x.y.z or x.y.z-alpha.N`)
  const [, major, minor, patch, alpha] = match
  if (alpha !== undefined && Number(alpha) >= 999) throw new Error(`alpha.${alpha} doesn't fit below 999`)
  const number = Number(patch) * 1000 + (alpha === undefined ? 999 : Number(alpha))
  return { version: `${major}.${minor}.${number}`, preRelease: alpha !== undefined }
}
