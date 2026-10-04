# ADR-0088: The playground is a workspace of example files, converts both ways with either side on the left, and shows docs on hover

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation, three asks:
  - "the playground shall have a side bar instead. that would feel like the cursor/vscode for
    different files, and them inside folders. for different samples"
  - "would be nice if in the playground we have the server lfs? docs when hovering, for all
    effectscript docs keywords, data, etc. real docs helpful and to learn"
  - "we shall note that its both ways! so we shall be able to swap left and right, and make sure
    the user understand its both ways"

  Agent rulings for the rest.
- **Related:** ADR-0084 (partly superseded: the examples menu, EffectScript fixed on the left),
  ADR-0085 (concepts, intent colours), ADR-0086 (the examples follow the docs; the infra sketch),
  ADR-0050 (Effect's examples in EffectScript), ADR-0078 (Warn for previews), spec §9.2

## Context

The playground's examples were a dropdown, so they read as a list of demos rather than a project.
The panes always had EffectScript on the left, although the playground has converted TypeScript
back to EffectScript since ADR-0054. Nothing on screen said so, and people who come from Effect
TypeScript would rather start from their own side.

Our language server's hovers (`@effectscript/language`) are TypeScript's own, on the compiled
code. Running them in the browser would mean shipping TypeScript and Effect's type definitions, a
download of several megabytes, for a playground that loads in a second. What explains EffectScript
to a newcomer is its constructs, the names a file declares, and Effect's own documentation of the
builtins.

## Decision

### An explorer of example files

- **A sidebar** lists the examples as files in folders, as an editor shows a project:
  `language/`, `extensions/` (with `proofs/`, `app/` and `infra/`) and `gallery/`. Each preset has
  a `path`. The order is curated, not alphabetical.
- **Multi-file folders where the real thing has them:** `proofs/` has `bank.efx` and the
  `bank.test.efx` that runs its laws, and `infra/` has `site.efx` and the `alchemy.run.efx` that
  deploys it. Both new files are proposed (ADR-0075, ADR-0086) and show their ADR's lowering.
- **Opening a file keeps your edits:** each file's text and scroll position stay while you switch,
  until the page reloads. An edited file shows a dot in the explorer and in its tab. A proposed file
  carries Warn's ▲, as preview markers do (ADR-0078).
- **A share link** opens as `shared.efx` at the top of the explorer.
- **The tabs name the files:** the folder dimmed, then the file (`language/brands.efx`), and the
  output as `brands.ts`, or `.tsx` when the output has JSX.
- **Editor conventions:** ⌘B or Ctrl+B toggles the explorer, inside the editors too. Arrow keys
  move through the tree, and left and right close and open folders. On narrow screens the explorer
  is a drawer over the panes that closes when a file opens.
- **The compiler gets the file's path** as its file name.

### Both ways, either side on the left

- **The toolbar says so:** "Both ways. Edit the EffectScript and the TypeScript follows. Edit the
  TypeScript and it turns back into EffectScript." The page's intro line says the same.
- **A swap button** in the channel between the panes, or in the toolbar on narrow screens, puts
  TypeScript on the left. The choice is remembered in the browser.
- **The band** runs between the two panes' inner edges, whichever side each is on.
- **The left side leads:** each pane says whether you write it or it is compiled or converted as
  you type.
- **Scrolling:** while EffectScript is the source, the TypeScript follows it through the mapping.
  While TypeScript is the source, the reverse compiler has no mapping, so the EffectScript follows
  in proportion.

### Docs on hover

- **Monaco's hover widget, on both panes.** The playground loads it on its own, because
  `editor.api` leaves editor contributions out.
- **What a hover shows, first match wins:**
  - **A name the file declares** (`schema`, `error`, `service`, `brand`, `effect`, `resource` and
    the rest): its kind and its declaration, highlighted as EffectScript. On the TypeScript side
    the same name says it was declared in the EffectScript.
  - **An EffectScript construct:** a few words and one to three sentences per keyword, written from
    the syntax reference and the guides, with a link to its reference page under `/docs/reference`.
    `await`, `throw`, `console`, `Date`, `Math` and `process` say what they mean inside `effect`
    code. Syntax that isn't built says so and links its ADR.
  - **An Effect export**, qualified (`Schema.isPattern`) or a bare builtin (`retry` is
    `Effect.retry`, in the prelude's order): Effect's own JSDoc summary and "When to use", its
    category, and a link to its examples in EffectScript when the site has them (ADR-0050).
- **Effect's docs are extracted when the site builds** (`src/lib/effectDocs.ts`, run by the
  content script). It reads the JSDoc of every public module of `effect`, the ones the prelude
  imports, from Effect's sources in this repository. It writes one file per namespace plus an index
  under `/playground/docs/`. The playground fetches the index on the first hover, and each
  namespace the first time it is needed.

## Consequences

- **The examples read as a project.** Related files sit together, and the playground's own words
  (files, tabs, edited dots, ⌘B) are the ones people know from their editor.
- **Two-way is visible:** the toolbar sentence, the swap button and the pane roles. People who
  come from Effect TypeScript can start on their side.
- **Docs without a type checker.** Hovers explain words, names and Effect's API, but they don't
  show inferred types. A local variable's type, or what an expression returns, still needs the
  language server. If that becomes the ask, TypeScript in a worker with Effect's type definitions
  is the next step, at a cost of megabytes.
- **The docs grow with the language and with Effect.** The construct table is maintained by hand,
  and its test requires every entry to link a page or an ADR. Effect's docs follow its sources
  whenever the site builds.
- **Size:** the docs come to about 350 small JSON files (`Effect.json` is 57 KB, 12 KB
  compressed). They are fetched only when someone hovers.
- **Edits don't survive a reload:** they live in the page, not in browser storage. The share link
  is the way to keep code.

## Alternatives considered

- **Keep the dropdown, with groups:** compact, but it reads as a menu of demos, can't show folders
  or edited state, and the user asked for a sidebar.
- **Tabs for open files, as in VS Code:** more chrome than the examples need. The explorer and the
  tab naming the open file carry the same information.
- **The language server in the browser** (Volar and TypeScript in a worker, with Effect's types):
  real type hovers, but a download of several megabytes and slower start-up. The constructs and
  Effect's JSDoc explain more to a learner than a type does.
- **Effect's docs as one file:** 1.3 MB of JSON (254 KB compressed) for the whole prelude, fetched
  on the first hover. Per-namespace files fetch what is used.
- **A two-way toggle that rebuilds the page:** swapping the panes in place keeps both editors,
  their text and the mapping.
- **Edits kept in browser storage:** they would outlive the session and confuse returning visitors
  with stale examples. The share link already keeps code on purpose.
