/**
 * The playground's colours by intent (ADR-0085): one reading for both panes, so a thing has the
 * same colour as EffectScript and as Effect TypeScript. Effect's machinery is violet, structure is
 * pink, Effect's three channels keep their signals (success data green, errors red, services blue,
 * ADR-0078), literals are orange and other types cyan.
 */
import { signalRanges } from "../lib/signals.ts"

export type Role =
  | "keyword"
  | "effect"
  | "pass"
  | "fail"
  | "need"
  | "literal"
  | "type"
  | "call"
  | "comment"

export interface Painted {
  readonly start: number
  readonly end: number
  readonly role: Role
}

/** The names a program declares, by what they are: Effect's A, E and R. */
export interface Names {
  readonly data: ReadonlySet<string>
  readonly errors: ReadonlySet<string>
  readonly services: ReadonlySet<string>
}

/** Declared names in EffectScript and in the Effect TypeScript it compiles to. */
export const namesOf = (...texts: ReadonlyArray<string>): Names => {
  const data = new Set<string>()
  const errors = new Set<string>()
  const services = new Set<string>()
  const collect = (text: string, pattern: RegExp, into: Set<string>) => {
    for (const match of text.matchAll(pattern)) into.add(match[1]!)
  }
  for (const text of texts) {
    collect(text, /\berror\s+([A-Z][\w$]*)/g, errors)
    collect(text, /\b(?:schema|brand)\s+([A-Z][\w$]*)/g, data)
    collect(text, /^\s*\|\s*([A-Z][\w$]*)\s*\{/gm, data)
    collect(text, /\b(?:service|config)\s+([A-Z][\w$]*)/g, services)
    collect(text, /\bclass\s+([\w$]+)\s+extends\s+Schema\.(?:TaggedError|TaggedErrorClass|ErrorClass)\b/g, errors)
    collect(text, /\bclass\s+([\w$]+)\s+extends\s+Schema\.(?:Class|TaggedClass)\b/g, data)
    collect(text, /\bclass\s+([\w$]+)\s+extends\s+Context\.\w+/g, services)
  }
  return { data, errors, services }
}

/** EffectScript's declaration words, which are plain identifiers in TypeScript. */
const declarations = new Set([
  "schema",
  "error",
  "service",
  "layer",
  "config",
  "api",
  "group",
  "impl",
  "command",
  "rpc",
  "tool",
  "toolkit",
  "entity",
  "workflow",
  "activity",
  "test",
  "describe",
  "match",
  "when",
  "key",
  "with",
  "using",
  "status",
  "law",
  "requires",
  "brand",
  "where",
  "get",
  "set"
])

const structure = new Set([
  "export",
  "import",
  "from",
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "new",
  "class",
  "extends",
  "implements",
  "interface",
  "type",
  "enum",
  "function",
  "async",
  "static",
  "readonly",
  "declare",
  "as",
  "of",
  "in",
  "typeof",
  "instanceof",
  "keyof",
  "try",
  "catch",
  "finally",
  "throw",
  "default",
  "this",
  "get",
  "set",
  // EffectScript's declarations
  "schema",
  "error",
  "service",
  "layer",
  "config",
  "api",
  "group",
  "impl",
  "command",
  "rpc",
  "tool",
  "toolkit",
  "entity",
  "workflow",
  "activity",
  "test",
  "describe",
  "match",
  "when",
  "key",
  "with",
  "using",
  "status",
  "law",
  "requires",
  "brand",
  "where"
])

/** JavaScript's own keywords: the structure words of the TypeScript pane. */
const javascript = new Set([...structure].filter((word) => !declarations.has(word)))

/** Words that run or shape effects: the language's own, and Effect's builtins. */
const effectWords = new Set(["effect", "await", "main", "defer", "yield", "pipe"])

const combinators = new Set([
  "retry",
  "timeout",
  "provide",
  "sleep",
  "all",
  "forEach",
  "succeed",
  "fail",
  "tryPromise",
  "option",
  "race",
  "orElse",
  "catchTag",
  "catchAll",
  "repeat",
  "schedule",
  "fork",
  "forkScoped",
  "scoped",
  "acquireRelease",
  "withSpan",
  "ensuring",
  "either",
  "exit",
  "delay",
  "interrupt",
  "tap",
  "zip",
  "orDie",
  "runMain"
])

/** Namespaces whose members are effects, and the colour of the others. */
const namespaces: Readonly<Record<string, Role>> = {
  Effect: "effect",
  Layer: "effect",
  Stream: "effect",
  Schedule: "effect",
  Fiber: "effect",
  Queue: "effect",
  Ref: "effect",
  Scope: "effect",
  Match: "effect",
  Console: "effect",
  NodeRuntime: "effect",
  BunRuntime: "effect",
  NodeServices: "need",
  Context: "need",
  Config: "need",
  Schema: "type",
  Option: "type",
  Cause: "fail",
  Exit: "type"
}

const literals = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"])
const primitives = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "unknown",
  "never",
  "void",
  "any",
  "object"
])

/** Tokens: comments, strings, numbers, multi-character operators, words (with a `*`), the rest. */
const lexer =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?n?\b)|(\|>|=>|===|!==|\?\?|\.\.\.|[^\s\w$])|([A-Za-z_$][\w$]*)/g

/** Every span worth a colour in `text`, by its intent. */
export const paint = (text: string, language: "efx" | "ts", names: Names): Array<Painted> => {
  const out: Array<Painted> = []
  // the lexer skips whitespace, so neighbours in this list are the neighbouring tokens
  const tokens = [...text.matchAll(lexer)]
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    const [whole, comment, string, number, operator, word] = token
    const start = token.index
    const push = (role: Role, end = start + whole.length) => out.push({ start, end, role })
    if (comment !== undefined) push("comment")
    else if (string !== undefined || number !== undefined) push("literal")
    else if (operator !== undefined) {
      if (operator === "|>") push("effect")
    } else if (word !== undefined) {
      const before = tokens[i - 1]?.[0]
      const after = tokens[i + 1]?.[0]
      const next = text[start + word.length]
      const member = before === "."
      if (!member && namespaces[word] !== undefined && after === ".") {
        // `Effect.fn`, `Schema.String`: the namespace and its member share a colour
        const property = tokens[i + 2]
        const role = namespaces[word]!
        push(role, property?.[5] !== undefined ? property.index + property[0].length : undefined)
        if (property?.[5] !== undefined) i += 2
      } else if (names.errors.has(word)) push("fail")
      else if (names.services.has(word)) push("need")
      else if (names.data.has(word)) push("pass")
      else if (word === "throws") push("fail")
      else if (word === "needs") push("need")
      else if (word === "function" && next === "*") push("effect", start + word.length + 1)
      else if (effectWords.has(word) && !member) push("effect", next === "*" ? start + word.length + 1 : undefined)
      else if (combinators.has(word) && !member && (before === "|>" || after === "(")) push("effect")
      else if (literals.has(word)) push("literal")
      else if (primitives.has(word)) push("type")
      else if ((language === "efx" ? structure : javascript).has(word) && !member) push("keyword")
      else if (
        /^[A-Z]/.test(word) &&
        (before === ":" || before === "<" || before === "|" || before === "&" || before === "extends" || before === ",")
      ) push("type")
      else if (after === "(") push("call")
    }
  }
  // Effect's three channels in a signature win over everything else (ADR-0078)
  for (const range of signalRanges(text, language)) out.push({ start: range.start, end: range.end, role: range.signal })
  return out
}
