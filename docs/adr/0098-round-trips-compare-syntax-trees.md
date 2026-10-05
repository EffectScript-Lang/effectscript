# ADR-0098: Round trips are compared as syntax trees

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** agent ruling, from the real-projects corpus (ADR-0094)
- **Related:** ADR-0030 (amended), ADR-0092

## Context

ADR-0030 lets the reverse compiler rewrite TypeScript only when the result compiles back to the
same program. For code that isn't compiler output, "the same" meant the same code tokens, trailing
commas aside, and the same comments in order. Amendment 3 then had to add line-break markers after
`return`, `throw` and the other restricted productions, because a token stream can't see where
automatic semicolon insertion changes the program.

Most real Effect code is formatted by Prettier with semicolons. EffectScript's compiler writes none,
so every converted form in such a file compiled back with its semicolons gone and failed the
check. In alchemy, half the corpus by tokens, statements like
`export const Link = Schema.Struct({ … });` stayed TypeScript for that reason alone.

Dropping semicolons from the token stream would be unsound: `if (x);` and `a;\n(b)` mean something
else without them.

## Decision

- Outside compiler output (whose golden fixtures stay byte-identical), a round trip holds when the
  code compiles back to the **same syntax tree** and the same comments in the same order.
- The tree is the parser's, without source positions. Literals keep their spelling (`raw`), so
  `'a'` and `"a"`, or `0x10` and `16`, still differ.
- Semicolons, trailing commas, redundant parentheses and layout are not part of the tree. Wherever
  they change the program (ASI, `if (x);`, precedence), the tree changes too, so Amendment 3's
  line-break markers are no longer needed.

## Consequences

- Files formatted with semicolons convert like files without them. Compiling the EffectScript back
  gives code without semicolons, which the project's formatter restores.
- The check is a stronger statement than token equality: same tree, same program, for every
  construct, including the ASI cases Amendment 3 enumerated by hand.

## Alternatives considered

- **Drop statement-ending semicolons from the token stream:** needs its own ASI rules (`if (x);`,
  a next line starting with `(`, `[` or a template), the hand-enumerated kind of check that
  Amendment 3 had to patch.
- **Have the compiler write semicolons when the source had them:** the compiler would need to know
  the user's style, and its output for one `.efx` file would depend on where it came from.
