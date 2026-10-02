# ADR-0035: Import `.efx` modules with their extension

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling after the Plan 9 final review
- **Related:** spec §7.2; ADR-0021, ADR-0022, ADR-0034

## Context

Plan 9's Bun plugin rewrote extensionless relative imports (`./greet`) to `.efx` files, and Vite
resolves them through `resolve.extensions`. Node's `effectscript/register`, `efx build`, and the
type checker resolve only explicit `.efx` specifiers. Combined with ADR-0034, the same project
could run through `efx run` on a machine with Bun and fail with `ERR_MODULE_NOT_FOUND` on one
without it.

## Decision

The portable form of an import of an EffectScript module is the full name: `import { x } from
"./x.efx"`. Node, Bun, `efx build`, `efx check` and the editor all resolve it.

- **Bun:** the plugin no longer rewrites extensionless imports. It behaves like Node.
- **Vite:** `.efx` stays in `resolve.extensions`, because extensionless resolution is ordinary
  bundler behavior there. The docs still use the explicit form.

## Consequences

- One spelling works on every path, and a project's behavior never depends on which runtime
  `efx run` picks.
- Code written extensionless for Vite needs the extension before it runs on Node or Bun. Error
  messages name the missing module, so the fix is obvious.

## Alternatives considered

- **Extensionless everywhere:** Node's resolve hook could try `.efx`, but the TypeScript checker
  and `efx build` would also need it, which means every resolver EffectScript touches.
- **Keep the Bun-only rewrite:** runtime-dependent behavior is the bug the review found.
