/**
 * The doc model (docs spec §3.1): a module's exported declarations, read from the parse tree only.
 * Everything is kept exactly as written; nothing is inferred (ADR-0043).
 *
 * @since 4.0.0
 */
import type { Node } from "../compiler/ast.ts"
import type { Diagnostic } from "../compiler/diagnostics.ts"
import { type Comment, parse } from "../compiler/parser/parse.ts"
import { type DocComment, docCommentBefore, type DocExample, isModuleDoc, parseDocComment } from "./comment.ts"

/**
 * @since 4.0.0
 * @category models
 */
export type DocKind =
  | "effect"
  | "function"
  | "schema"
  | "error"
  | "service"
  | "layer"
  | "config"
  | "command"
  | "api"
  | "group"
  | "atom"
  | "const"
  | "type"
  | "interface"
  | "class"
  | "field"
  | "member"
  | "variant"

/**
 * @since 4.0.0
 * @category models
 */
export interface DocParam {
  readonly name: string
  readonly type: string | undefined
}

/**
 * @since 4.0.0
 * @category models
 */
export interface DocDeclaration {
  readonly kind: DocKind
  readonly name: string
  /** Source offset of the declaration (after `export`). */
  readonly start: number
  /** As written, without the body, on one line. */
  readonly signature: string
  readonly params: ReadonlyArray<DocParam>
  /** A, E and R as written (`: A throws E needs R`). */
  readonly success: string | undefined
  readonly failure: string | undefined
  readonly requirements: string | undefined
  readonly doc: DocComment | undefined
  /** Service members, schema/error/config fields, ADT variants. */
  readonly members: ReadonlyArray<DocDeclaration>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface DocImport {
  readonly from: string
  readonly imported: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface DocModule {
  readonly file: string
  /** The module path (`bank/transfer`); `""` for the root index. */
  readonly path: string
  readonly source: string
  /** The `@module` comment. */
  readonly doc: DocComment | undefined
  readonly declarations: ReadonlyArray<DocDeclaration>
  /** Local name → relative import, for linking. */
  readonly imports: ReadonlyMap<string, DocImport>
  readonly hasMain: boolean
}

/**
 * A file's module path: relative to the package root, without a leading `src/` or the extension;
 * `index` files take their directory's path (like service keys, ADR-0014).
 *
 * @since 4.0.0
 * @category utils
 */
export const modulePath = (relativeFile: string): string => {
  const path = relativeFile.replace(/\\/g, "/").replace(/^src\//, "").replace(/\.(efx|tsx?|mts)$/, "")
  if (path === "index") return ""
  return path.endsWith("/index") ? path.slice(0, -"/index".length) : path
}

interface Builder {
  readonly source: string
  readonly comments: ReadonlyArray<Comment>
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

const slice = (b: Builder, from: number, to: number): string => oneLine(b.source.slice(from, to))

const text = (b: Builder, node: Node | null | undefined): string | undefined =>
  node == null ? undefined : slice(b, node.start, node.end)

/** The doc comment directly before `start`, unless it documents the module. */
const docAt = (b: Builder, start: number): DocComment | undefined => {
  const comment = docCommentBefore(b.source, b.comments, start)
  if (comment === undefined) return undefined
  const doc = parseDocComment(b.source, comment.start, comment.end)
  return isModuleDoc(doc) ? undefined : doc
}

const params = (b: Builder, list: ReadonlyArray<Node>): Array<DocParam> =>
  list.map((param) => {
    const target = param.type === "AssignmentPattern"
      ? param.left
      : param.type === "TSParameterProperty"
      ? param.parameter
      : param.type === "RestElement"
      ? param.argument
      : param
    const name: string = target.type === "Identifier" ? target.name : text(b, target) ?? "?"
    const annotation: Node | undefined = target.typeAnnotation ?? param.typeAnnotation
    return { name, type: text(b, annotation?.typeAnnotation) }
  })

/** A, E and R of a function-like node. */
const clauses = (b: Builder, fn: Node) => {
  const returnType: Node | undefined = fn.returnType ?? undefined
  return {
    success: text(b, returnType?.typeAnnotation),
    failure: text(b, returnType?.efxThrows),
    requirements: text(b, returnType?.efxNeeds)
  }
}

const leaf = {
  params: [],
  success: undefined,
  failure: undefined,
  requirements: undefined,
  members: []
} as const

const layerMemberName = (member: Node): string => {
  const key: string = member.key.name
  return member.efxLayer === undefined && key === "layer" ? "layer" : `layer${key[0]!.toUpperCase()}${key.slice(1)}`
}

const classMembers = (b: Builder, node: Node): Array<DocDeclaration> =>
  node.body.body.flatMap((member: Node): Array<DocDeclaration> => {
    if (member.static === true) return []
    const name = member.key?.type === "Identifier" ? member.key.name as string : text(b, member.key)
    if (name === undefined) return []
    const doc = docAt(b, member.start)
    if (member.type === "MethodDefinition" || member.type === "TSDeclareMethod") {
      const fn: Node = member.value ?? member
      return [{
        kind: "member",
        name,
        start: member.start,
        signature: slice(b, member.start, fn.body?.start ?? member.end),
        params: params(b, fn.params),
        ...clauses(b, fn),
        doc,
        members: []
      }]
    }
    if (member.type !== "PropertyDefinition") return []
    const isLayer = node.efxKind === "service" && (member.efxLayer !== undefined || name === "layer") &&
      member.value != null
    if (isLayer) {
      const signature = slice(b, member.start, member.value.start).replace(/\s*=$/, "")
      return [{ ...leaf, kind: "layer", name: layerMemberName(member), start: member.start, signature, doc }]
    }
    return [{ ...leaf, kind: "field", name, start: member.start, signature: slice(b, member.start, member.end), doc }]
  })

const classKinds = new Set<string>(["schema", "error", "service", "config"])

const declaration = (b: Builder, node: Node, start: number): DocDeclaration | undefined => {
  const doc = docAt(b, start)
  const whole = () => slice(b, start, node.end).replace(/;$/, "")
  switch (node.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction": {
      const effect = node.efx?.kind === "declaration"
      const from: number = effect ? node.efx.keyword.start : node.start
      return {
        kind: effect ? "effect" : "function",
        name: node.id?.name ?? "default",
        start,
        signature: slice(b, from, node.body?.start ?? node.end).replace(/;$/, ""),
        params: params(b, node.params),
        ...clauses(b, node),
        doc,
        members: []
      }
    }
    case "VariableDeclaration": {
      const declarator: Node | undefined = node.declarations[0]
      if (declarator === undefined || declarator.id.type !== "Identifier") return undefined
      const name: string = declarator.id.name
      const init: Node | null = declarator.init
      if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
        return {
          kind: init.efx !== undefined ? "effect" : "function",
          name,
          start,
          signature: slice(b, start, init.body.start).replace(/\s*=>$/, ""),
          params: params(b, init.params),
          ...clauses(b, init),
          doc,
          members: []
        }
      }
      const type = text(b, declarator.id.typeAnnotation?.typeAnnotation)
      return {
        ...leaf,
        kind: "const",
        name,
        start,
        signature: `${node.kind} ${name}${type === undefined ? "" : `: ${type}`}`,
        doc
      }
    }
    case "ClassDeclaration": {
      const kind: DocKind = classKinds.has(node.efxKind) ? node.efxKind : "class"
      const name: string = node.id?.name ?? "default"
      return { ...leaf, kind, name, start, signature: `${kind} ${name}`, doc, members: classMembers(b, node) }
    }
    case "SchemaAliasDeclaration":
      return { ...leaf, kind: "schema", name: node.id.name, start, signature: whole(), doc }
    case "SchemaAdtDeclaration":
      return {
        ...leaf,
        kind: "schema",
        name: node.id.name,
        start,
        signature: `schema ${node.id.name}`,
        doc,
        members: node.variants.map((variant: Node): DocDeclaration => ({
          ...leaf,
          kind: "variant",
          name: variant.id.name,
          start: variant.start,
          signature: slice(b, variant.start, variant.end),
          doc: docAt(b, variant.start),
          members: classMembers(b, variant)
        }))
      }
    case "LayerDeclaration":
      return { ...leaf, kind: "layer", name: node.id.name, start, signature: whole(), doc }
    case "AtomDeclaration":
      return { ...leaf, kind: "atom", name: node.id.name, start, signature: whole(), doc }
    case "CommandDeclaration":
      return {
        ...leaf,
        kind: "command",
        name: node.id?.name ?? node.name?.name ?? "command",
        start,
        signature: slice(b, start, node.body.start),
        doc
      }
    case "ApiDeclaration":
    case "GroupDeclaration":
      return {
        ...leaf,
        kind: node.type === "ApiDeclaration" ? "api" : "group",
        name: node.id?.name ?? node.name?.name ?? "api",
        start,
        signature: whole(),
        doc
      }
    case "TSTypeAliasDeclaration":
      return { ...leaf, kind: "type", name: node.id.name, start, signature: whole(), doc }
    case "TSInterfaceDeclaration":
      return { ...leaf, kind: "interface", name: node.id.name, start, signature: whole(), doc }
    default:
      return undefined
  }
}

const declaredName = (node: Node): string | undefined =>
  node.type === "VariableDeclaration" ? node.declarations[0]?.id?.name : node.id?.name

const isRelative = (specifier: unknown): specifier is string =>
  typeof specifier === "string" && /^\.\.?\//.test(specifier)

/**
 * Builds the doc model of one file. A file that doesn't parse gives an empty module and the
 * parse diagnostics.
 *
 * @since 4.0.0
 * @category constructors
 */
export const docModule = (
  file: string,
  path: string,
  source: string
): { readonly module: DocModule; readonly diagnostics: ReadonlyArray<Diagnostic> } => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return {
      module: { file, path, source, doc: undefined, declarations: [], imports: new Map(), hasMain: false },
      diagnostics: parsed.diagnostics
    }
  }
  const b: Builder = { source, comments: parsed.comments }
  const body: ReadonlyArray<Node> = parsed.program.body
  const imports = new Map<string, DocImport>()
  const exportedLocals = new Set<string>()
  for (const statement of body) {
    if (statement.type === "ImportDeclaration" && isRelative(statement.source.value)) {
      for (const specifier of statement.specifiers) {
        const imported = specifier.type === "ImportSpecifier"
          ? specifier.imported.name ?? String(specifier.imported.value)
          : specifier.type === "ImportDefaultSpecifier"
          ? "default"
          : "*"
        imports.set(specifier.local.name, { from: statement.source.value, imported })
      }
    }
    if (statement.type === "ExportNamedDeclaration" && statement.declaration == null && statement.source == null) {
      for (const specifier of statement.specifiers) exportedLocals.add(specifier.local.name ?? specifier.local.value)
    }
  }
  const declarations: Array<DocDeclaration> = []
  for (const statement of body) {
    if (statement.type === "ExportNamedDeclaration") {
      if (statement.declaration == null) continue
      const d = declaration(b, statement.declaration, statement.declaration.start)
      if (d !== undefined) declarations.push(d)
    } else if (statement.type === "ExportDefaultDeclaration") {
      const d = declaration(b, statement.declaration, statement.declaration.start)
      if (d !== undefined) declarations.push({ ...d, name: "default" })
    } else {
      const name = declaredName(statement)
      if (name === undefined || !exportedLocals.has(name)) continue
      const d = declaration(b, statement, statement.start)
      if (d !== undefined) declarations.push(d)
    }
  }
  const first = parsed.comments[0]
  const firstDoc = first !== undefined && !first.line && source.startsWith("/**", first.start)
    ? parseDocComment(source, first.start, first.end)
    : undefined
  return {
    module: {
      file,
      path,
      source,
      doc: firstDoc !== undefined && isModuleDoc(firstDoc) ? firstDoc : undefined,
      declarations,
      imports,
      hasMain: body.some((statement) => statement.type === "MainStatement")
    },
    diagnostics: []
  }
}

/**
 * Every runnable example of a module, with the name of what it documents (`Service.member` for
 * members, the module path for the module doc).
 *
 * @since 4.0.0
 * @category utils
 */
export const allExamples = (
  module: DocModule
): ReadonlyArray<{ readonly owner: string; readonly example: DocExample }> => {
  const out: Array<{ owner: string; example: DocExample }> = []
  for (const example of module.doc?.examples ?? []) out.push({ owner: module.path || "index", example })
  const visit = (d: DocDeclaration, prefix: string) => {
    const owner = prefix === "" ? d.name : `${prefix}.${d.name}`
    for (const example of d.doc?.examples ?? []) out.push({ owner, example })
    for (const member of d.members) visit(member, owner)
  }
  for (const d of module.declarations) visit(d, "")
  return out
}
