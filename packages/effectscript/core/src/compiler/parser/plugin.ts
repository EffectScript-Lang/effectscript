/**
 * The EffectScript acorn plugin. It extends `@sveltejs/acorn-typescript`'s parser.
 *
 * acorn's parser internals are untyped, so this module works with `any`-typed parser instances.
 *
 * @since 0.1.0
 */
import * as acorn from "acorn"
import { skipBalancedTokens, skipSpace } from "./scan.ts"

const tt = acorn.tokTypes

/**
 * The `|>` token. acorn treats `binop: 0` as "not an operator", so 0.5 sits below `??`/`||` (1).
 *
 * @since 0.1.0
 */
export const pipelineToken: acorn.TokenType & { readonly binop: number } = new (acorn.TokenType as unknown as new(
  label: string,
  config: { readonly beforeExpr: boolean; readonly binop: number }
) => acorn.TokenType & { readonly binop: number })("|>", { beforeExpr: true, binop: 0.5 })

const lineBreak = /[\n\r\u2028\u2029]/

interface EfxState {
  pipeDepth: number
  readonly arrowStarts: Set<number>
  readonly classKinds: Array<string>
}

/**
 * @since 0.1.0
 */
export const efxPlugin = (Base: any): any =>
  class EfxParser extends Base {
    efxState(): EfxState {
      return (this.efx ??= { pipeDepth: 0, arrowStarts: new Set<number>(), classKinds: [] })
    }

    // --- token helpers ---------------------------------------------------------------------------

    efxIsWord(word: string): boolean {
      return this.type === tt.name && this.value === word && !this.containsEsc
    }

    efxSameLine(next: { readonly start: number }): boolean {
      return !lineBreak.test(this.input.slice(this.end, next.start))
    }

    // --- tokenizer -------------------------------------------------------------------------------

    readToken_pipe_amp(code: number): any {
      if (code === 124 && !this.inType && this.input.charCodeAt(this.pos + 1) === 62) {
        return this.finishOp(pipelineToken, 2)
      }
      return super.readToken_pipe_amp(code)
    }

    // --- acorn-typescript gaps (found by test/superset.test.ts) ----------------------------------

    // `const` type parameters in signatures and function types: `<const A>(a: A) => A`
    tsTryParseTypeParameters(parseModifiers: unknown): any {
      return super.tsTryParseTypeParameters(parseModifiers ?? this.tsParseConstModifier)
    }

    // `import type { X }` must not bind a value, so `const X = …` in the same module is legal.
    declareName(name: string, bindingType: number, pos: number): any {
      if (this.importOrExportOuterKind === "type") return
      return super.declareName(name, bindingType, pos)
    }

    // --- pipeline --------------------------------------------------------------------------------

    parseExprOp(left: any, leftStartPos: number, leftStartLoc: any, minPrec: number, forInit: boolean): any {
      if (this.type === pipelineToken && pipelineToken.binop > minPrec) {
        const op = { start: this.start, end: this.end }
        this.next()
        const state = this.efxState()
        state.pipeDepth++
        const rightStart = this.start
        const rightStartLoc = this.startLoc
        const right = this.parseExprOp(
          this.parseMaybeUnary(null, false, false, forInit),
          rightStart,
          rightStartLoc,
          pipelineToken.binop,
          forInit
        )
        state.pipeDepth--
        const node = this.startNodeAt(leftStartPos, leftStartLoc)
        node.left = left
        node.right = right
        node.op = op
        this.finishNode(node, "PipelineExpression")
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit)
      }
      return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit)
    }

    efxNextIsNameSameLine(): boolean {
      const next = this.lookahead()
      // `error as Error`, `effect satisfies T` are expressions, not declarations
      return next.type === tt.name && this.efxSameLine(next) && next.value !== "as" && next.value !== "satisfies"
    }

    efxIsEffectDeclarationStart(): boolean {
      return this.efxIsWord("effect") && this.efxNextIsNameSameLine()
    }

    /** A block in which `await` is allowed: the body of an effect. */
    efxParseAsyncBlock(): any {
      const oldYieldPos = this.yieldPos
      const oldAwaitPos = this.awaitPos
      const oldAwaitIdentPos = this.awaitIdentPos
      const oldLabels = this.labels
      this.yieldPos = 0
      this.awaitPos = 0
      this.awaitIdentPos = 0
      this.labels = []
      this.enterScope(2 | 4) // SCOPE_FUNCTION | SCOPE_ASYNC
      const body = this.parseBlock(false)
      this.exitScope()
      this.yieldPos = oldYieldPos
      this.awaitPos = oldAwaitPos
      this.awaitIdentPos = oldAwaitIdentPos
      this.labels = oldLabels
      return body
    }

    /** Trailing `|> expr` items after a declaration-like construct. */
    efxAttachPipes(node: any): void {
      const pipes: Array<any> = []
      const ops: Array<{ start: number; end: number }> = []
      while (this.type === pipelineToken) {
        ops.push({ start: this.start, end: this.end })
        this.next()
        const start = this.start
        const startLoc = this.startLoc
        const state = this.efxState()
        state.pipeDepth++
        pipes.push(
          this.parseExprOp(this.parseMaybeUnary(null, false, false, false), start, startLoc, pipelineToken.binop, false)
        )
        state.pipeDepth--
      }
      node.efxPipes = pipes
      node.efxPipeOps = ops
      if (pipes.length > 0) this.eat(tt.semi)
    }

    efxParseEffectDeclaration(exportDefault: boolean): any {
      const node = this.startNode()
      const keyword = { start: this.start, end: this.end }
      this.next()
      const fn = this.parseFunction(node, 1, /* FUNC_STATEMENT */ false, true)
      fn.efx = exportDefault ? { kind: "declaration", keyword, exportDefault: true } : { kind: "declaration", keyword }
      this.efxAttachPipes(fn)
      return fn
    }

    parseStatement(context: unknown, topLevel: unknown, exports: unknown): any {
      if (this.efxIsEffectDeclarationStart()) return this.efxParseEffectDeclaration(false)
      if (this.efxDeferFollows()) return this.efxParseDefer()
      if (this.efxIsMainStart()) return this.efxParseMain()
      if (this.efxIsWord("schema") && this.efxNextIsNameSameLine()) return this.efxParseSchema()
      if (this.efxIsClassLikeStart()) return this.efxParseClassLike(this.value)
      if (this.efxIsBindingDeclarationStart("layer")) return this.efxParseBindingDeclaration("LayerDeclaration")
      if (this.efxIsBindingDeclarationStart("atom")) return this.efxParseBindingDeclaration("AtomDeclaration")
      if (this.efxIsCommandStart()) return this.efxParseCommand()
      if (this.efxIsHttpApiStart("group")) return this.efxParseGroup()
      if (this.efxIsHttpApiStart("api")) return this.efxParseApi()
      if (this.efxIsDescribeStart()) return this.efxParseDescribe()
      if (this.efxIsTestStart()) return this.efxParseTest()
      return super.parseStatement(context, topLevel, exports)
    }

    shouldParseExportStatement(): any {
      return this.efxIsEffectDeclarationStart() || this.efxIsClassLikeStart() ||
        this.efxIsBindingDeclarationStart("layer") || this.efxIsBindingDeclarationStart("atom") ||
        this.efxIsHttpApiStart("group") || this.efxIsHttpApiStart("api") || this.efxIsCommandStart() ||
        super.shouldParseExportStatement()
    }

    parseExportDefaultDeclaration(): any {
      if (this.efxIsEffectDeclarationStart()) return this.efxParseEffectDeclaration(true)
      return super.parseExportDefaultDeclaration()
    }

    // --- effect expressions --------------------------------------------------------------------

    /** `(params)` followed by `=>`, or by `: ReturnType … =>`. */
    efxIsParenArrowAhead(parenStart: number): boolean {
      const end = skipBalancedTokens(this.input, parenStart)
      if (end === -1) return false
      let i = skipSpace(this.input, end)
      if (this.input.startsWith("=>", i)) return true
      if (this.input[i] !== ":") return false
      i++
      while (i < this.input.length) {
        i = skipSpace(this.input, i)
        if (this.input.startsWith("=>", i)) return true
        const ch = this.input[i]!
        if (ch === "(" || ch === "[" || ch === "{") {
          i = skipBalancedTokens(this.input, i)
          if (i === -1) return false
          continue
        }
        if (ch === ";" || ch === "," || ch === ")" || ch === "}" || ch === "]") return false
        i++
      }
      return false
    }

    efxParseEffectBlock(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.body = this.efxParseAsyncBlock()
      return this.finishNode(node, "EffectBlock")
    }

    efxParseEffectArrow(): any {
      const keyword = { start: this.start, end: this.end }
      this.next()
      const state = this.efxState()
      const arrowStart = this.start
      state.arrowStarts.add(arrowStart)
      let arrow: any
      try {
        if (this.type === tt.parenL) {
          arrow = this.parseParenAndDistinguishExpression(true, false)
        } else {
          const start = this.start
          const startLoc = this.startLoc
          const param = this.parseIdent(false)
          this.expect(tt.arrow)
          arrow = this.parseArrowExpression(this.startNodeAt(start, startLoc), [param], true, false)
        }
      } finally {
        state.arrowStarts.delete(arrowStart)
      }
      if (arrow.type !== "ArrowFunctionExpression") {
        this.raise(keyword.start, "Expected an arrow function after `effect`")
      }
      arrow.efx = { kind: "arrow", keyword }
      return arrow
    }

    parseArrowExpression(node: any, params: any, isAsync: boolean, forInit: boolean): any {
      const forced = this.efxState().arrowStarts.has(node.start)
      return super.parseArrowExpression(node, params, forced || isAsync, forInit)
    }

    parseExprAtom(refDestructuringErrors: unknown, forInit: unknown, forNew: unknown): any {
      if (this.efxIsMatchAhead()) return this.efxParseMatch()
      if (this.efxIsImplAhead()) return this.efxParseImpl()
      if (this.efxIsWord("effect")) {
        const next = this.lookahead()
        if (this.efxSameLine(next)) {
          if (next.type === tt.braceL) return this.efxParseEffectBlock()
          if (next.type === tt.parenL && this.efxIsParenArrowAhead(next.start)) {
            // Speculative: `flag ? effect(1) : (n) => n` is a call to a function named `effect`.
            const attempt = this.tryParse(() => this.efxParseEffectArrow())
            if (attempt.error === null && attempt.node !== null) return attempt.node
          }
          if (next.type === tt.name && this.input.startsWith("=>", skipSpace(this.input, next.end))) {
            return this.efxParseEffectArrow()
          }
        }
      }
      if (this.type === tt._throw) {
        const node = this.startNode()
        this.next()
        node.argument = this.parseMaybeUnary(null, false, false, false)
        return this.finishNode(node, "ThrowExpression")
      }
      if (this.type === tt._do) {
        const node = this.startNode()
        this.next()
        node.body = this.parseBlock()
        return this.finishNode(node, "DoExpression")
      }
      if (this.type === tt.modulo && this.efxState().pipeDepth > 0) {
        const node = this.startNode()
        this.next()
        return this.finishNode(node, "TopicReference")
      }
      return super.parseExprAtom(refDestructuringErrors, forInit, forNew)
    }

    // --- effect methods ------------------------------------------------------------------------

    efxIsMethodAhead(): boolean {
      if (!this.efxIsWord("effect")) return false
      const next = this.lookahead()
      return this.efxSameLine(next) &&
        (next.type === tt.name || next.type === tt.string || next.type === tt.num || next.type === tt.bracketL ||
          next.type.keyword !== undefined)
    }

    parseProperty(isPattern: boolean, refDestructuringErrors: unknown): any {
      if (!isPattern && this.efxIsMethodAhead()) {
        const keyword = { start: this.start, end: this.end }
        this.value = "async" // reuse acorn's `async` method path; the key is re-parsed afterwards
        const prop = super.parseProperty(isPattern, refDestructuringErrors)
        prop.efxMethod = true
        if (prop.value?.type === "FunctionExpression") prop.value.efx = { kind: "method", keyword }
        return prop
      }
      return super.parseProperty(isPattern, refDestructuringErrors)
    }

    parseClassElement(constructorAllowsSuper: boolean): any {
      const kinds = this.efxState().classKinds
      if (kinds[kinds.length - 1] === "service" && this.efxIsWord("layer")) {
        const next = this.lookahead()
        if (next.type === tt.name && this.efxSameLine(next)) {
          const keyword = { start: this.start, end: this.end }
          this.next()
          const element = super.parseClassElement(constructorAllowsSuper)
          element.efxLayer = { keyword }
          element.start = keyword.start
          return element
        }
      }
      if (this.efxIsMethodAhead()) {
        const keyword = { start: this.start, end: this.end }
        this.value = "async"
        const element = super.parseClassElement(constructorAllowsSuper)
        element.efx = { kind: "method", keyword }
        if (element.value?.type === "FunctionExpression" || element.value?.type === "TSDeclareMethod") {
          element.value.efx = element.efx
        }
        return element
      }
      return super.parseClassElement(constructorAllowsSuper)
    }

    // --- throws / needs ------------------------------------------------------------------------

    tsParseTypeOrTypePredicateAnnotation(returnToken: unknown): any {
      const annotation = super.tsParseTypeOrTypePredicateAnnotation(returnToken)
      if (this.efxIsWord("throws") && !this.hasPrecedingLineBreak()) {
        annotation.efxThrowsKeyword = { start: this.start, end: this.end }
        this.next()
        annotation.efxThrows = this.tsInType(() => this.tsParseType())
      }
      if (this.efxIsWord("needs") && !this.hasPrecedingLineBreak()) {
        annotation.efxNeedsKeyword = { start: this.start, end: this.end }
        this.next()
        annotation.efxNeeds = this.tsInType(() => this.tsParseType())
      }
      if (annotation.efxThrows !== undefined || annotation.efxNeeds !== undefined) annotation.end = this.lastTokEnd
      return annotation
    }

    parseTryStatement(node: any): any {
      this.next()
      node.block = this.parseBlock()
      node.handlers = []
      while (this.type === tt._catch) {
        const clause = this.startNode()
        this.next()
        if (this.eat(tt.parenL)) {
          clause.param = this.parseCatchClauseParam()
        } else {
          clause.param = null
          this.enterScope(0)
        }
        clause.body = this.parseBlock(false)
        this.exitScope()
        node.handlers.push(this.finishNode(clause, "CatchClause"))
      }
      node.handler = node.handlers[0] ?? null
      node.finalizer = this.eat(tt._finally) ? this.parseBlock() : null
      if (node.handler === null && node.finalizer === null) this.raise(node.start, "Missing catch or finally clause")
      return this.finishNode(node, "TryStatement")
    }

    efxDeferFollows(): boolean {
      if (!this.efxIsWord("defer")) return false
      const next = this.lookahead()
      if (!this.efxSameLine(next)) return false
      return next.type === tt.braceL || next.type === tt.name || next.type === tt._new || next.type === tt._this ||
        next.type === tt.string || next.type === tt._void
    }

    efxParseDefer(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.argument = this.type === tt.braceL ? this.parseBlock() : this.parseExpression()
      this.semicolon()
      return this.finishNode(node, "DeferStatement")
    }

    // `await x |> f |> g` awaits the whole pipeline.
    parseAwait(forInit: boolean): any {
      const node = super.parseAwait(forInit)
      if (this.type !== pipelineToken) return node
      let left = node.argument
      const state = this.efxState()
      while (this.type === pipelineToken) {
        const op = { start: this.start, end: this.end }
        this.next()
        state.pipeDepth++
        const rightStart = this.start
        const rightStartLoc = this.startLoc
        const right = this.parseExprOp(
          this.parseMaybeUnary(null, false, false, forInit),
          rightStart,
          rightStartLoc,
          pipelineToken.binop,
          forInit
        )
        state.pipeDepth--
        const pipe = this.startNodeAt(left.start, left.loc.start)
        pipe.left = left
        pipe.right = right
        pipe.op = op
        left = this.finishNode(pipe, "PipelineExpression")
      }
      node.argument = left
      return this.finishNode(node, "AwaitExpression")
    }

    efxIsClassLikeStart(): boolean {
      return (this.efxIsWord("schema") || this.efxIsWord("error") || this.efxIsWord("service") ||
        this.efxIsWord("config")) &&
        this.efxNextIsNameSameLine()
    }

    efxParseClassLike(kind: string): any {
      const node = this.startNode()
      node.efxKind = kind
      node.efxKeyword = { start: this.start, end: this.end }
      return this.parseClass(node, true)
    }

    parseClass(node: any, isStatement: unknown): any {
      const state = this.efxState()
      state.classKinds.push(node.efxKind ?? "class")
      try {
        return super.parseClass(node, isStatement)
      } finally {
        state.classKinds.pop()
      }
    }

    efxParseSchema(): any {
      const name = this.lookahead()
      const after = skipSpace(this.input, name.end)
      if (this.input[after] === "=" && this.input[after + 1] !== "=" && this.input[after + 1] !== ">") {
        return this.efxParseSchemaAlias()
      }
      return this.efxParseClassLike("schema")
    }

    efxIsVariantsStart(): boolean {
      let i = this.start
      if (this.type === tt.bitwiseOR) i = skipSpace(this.input, this.end)
      const match = /^[A-Za-z_$][\w$]*/.exec(this.input.slice(i))
      return match !== null && this.input[skipSpace(this.input, i + match[0].length)] === "{"
    }

    efxParseSchemaAlias(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.id = this.parseIdent()
      this.expect(tt.eq)
      if (this.efxIsVariantsStart()) {
        node.variants = []
        this.eat(tt.bitwiseOR)
        do {
          const id = this.startNode()
          const name = this.value
          const idEnd = this.end
          const idEndLoc = this.endLoc
          const variant = this.startNode()
          variant.efxKind = "variant"
          this.parseClass(variant, "nullableID") // consumes the variant name in place of `class`
          id.name = name
          variant.id = this.finishNodeAt(id, "Identifier", idEnd, idEndLoc)
          node.variants.push(variant)
        } while (this.eat(tt.bitwiseOR))
        this.semicolon()
        return this.finishNode(node, "SchemaAdtDeclaration")
      }
      node.typeAnnotation = this.tsInType(() => this.tsParseType())
      this.semicolon()
      return this.finishNode(node, "SchemaAliasDeclaration")
    }

    parseClassSuper(node: any): any {
      if (node.efxKind === "service" && this.efxIsWord("as")) {
        this.next()
        node.efxServiceKey = this.parseExprAtom(null, false, false)
      }
      return super.parseClassSuper(node)
    }

    /** `group Name ["id"] { … }` / `api Name ["id"] { … }` (§4.14). */
    efxIsHttpApiStart(keyword: string): boolean {
      if (!this.efxIsWord(keyword) || !this.efxNextIsNameSameLine()) return false
      const name = this.lookahead()
      const after = skipSpace(this.input, name.end)
      return this.input[after] === "{" || this.input[after] === "\"" || this.input[after] === "'"
    }

    efxParseHttpApiHead(node: any): void {
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.id = this.parseIdent()
      node.identifier = this.type === tt.string ? this.parseExprAtom(null, false, false) : null
      this.expect(tt.braceL)
    }

    efxParseGroup(): any {
      const node = this.startNode()
      this.efxParseHttpApiHead(node)
      node.endpoints = []
      node.middlewares = []
      while (!this.eat(tt.braceR)) {
        if (this.efxIsWord("middleware")) {
          this.next()
          node.middlewares.push(this.parseExprSubscripts(null, false))
          this.eat(tt.semi)
          continue
        }
        const line = this.startNode()
        if (this.type !== tt.name || !/^(get|post|put|patch|del|head|options)$/.test(this.value)) {
          this.unexpected()
        }
        line.method = this.value
        this.next()
        line.name = this.parseIdent()
        line.path = this.parseExprAtom(null, false, false)
        line.sections = []
        if (this.eat(tt.parenL)) {
          while (!this.eat(tt.parenR)) {
            const section = this.startNode()
            section.key = this.parseIdent()
            this.expect(tt.colon)
            section.annotation = this.tsInType(() => this.tsParseType())
            line.sections.push(this.finishNode(section, "EndpointSection"))
            if (this.type !== tt.parenR) this.expect(tt.comma)
          }
        }
        line.success = this.eat(tt.colon) ? this.tsInType(() => this.tsParseType()) : null
        line.error = null
        if (this.efxIsWord("throws")) {
          this.next()
          line.error = this.tsInType(() => this.tsParseType())
        }
        node.endpoints.push(this.finishNode(line, "EndpointLine"))
        this.eat(tt.semi)
      }
      return this.finishNode(node, "GroupDeclaration")
    }

    efxParseApi(): any {
      const node = this.startNode()
      this.efxParseHttpApiHead(node)
      node.groups = []
      while (!this.eat(tt.braceR)) {
        node.groups.push(this.parseExprSubscripts(null, false))
        if (this.type !== tt.braceR) this.expect(tt.comma)
      }
      return this.finishNode(node, "ApiDeclaration")
    }

    /** `command name(…) { … }` (§4.14). */
    efxIsCommandStart(): boolean {
      if (!this.efxIsWord("command") || !this.efxNextIsNameSameLine()) return false
      const name = this.lookahead()
      return this.input[skipSpace(this.input, name.end)] === "("
    }

    efxParseCommand(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.id = this.parseIdent()
      this.expect(tt.parenL)
      node.params = []
      while (!this.eat(tt.parenR)) {
        const param = this.startNode()
        param.flag = this.type === tt.incDec && this.value === "--"
        if (param.flag) this.next()
        param.name = this.parseIdent()
        param.optional = this.eat(tt.question)
        this.expect(tt.colon)
        param.annotation = this.tsInType(() => this.tsParseType())
        param.value = this.eat(tt.eq) ? this.parseMaybeAssign() : null
        node.params.push(this.finishNode(param, "CommandParameter"))
        if (this.type !== tt.parenR) this.expect(tt.comma)
      }
      node.body = this.efxParseAsyncBlock()
      this.finishNode(node, "CommandDeclaration")
      this.efxAttachPipes(node)
      return node
    }

    /** `impl Api.group { … }` in expression position (§4.14). */
    efxIsImplAhead(): boolean {
      if (!this.efxIsWord("impl")) return false
      const lineEnd = this.input.indexOf("\n", this.end)
      const rest = this.input.slice(this.end, lineEnd === -1 ? undefined : lineEnd)
      return /^\s*[A-Za-z_$][\w$]*\s*\.\s*[A-Za-z_$][\w$]*\s*\{/.test(rest)
    }

    efxParseImpl(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.api = this.parseIdent()
      this.expect(tt.dot)
      node.group = this.parseIdent(true)
      node.body = this.efxParseAsyncBlock()
      return this.finishNode(node, "ImplExpression")
    }

    /** `describe "name" [with layer] { … }` (§4.14). */
    efxIsDescribeStart(): boolean {
      if (!this.efxIsWord("describe")) return false
      const next = this.lookahead()
      return next.type === tt.string && this.efxSameLine(next)
    }

    efxParseDescribe(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.name = this.parseExprAtom(null, false, false)
      node.layer = null
      if (this.type === tt._with) {
        this.next()
        node.layer = this.parseExprSubscripts(null, false)
      }
      node.body = this.parseBlock()
      return this.finishNode(node, "DescribeStatement")
    }

    /** `test[.live|.skip|.only] "name" { … }` (§4.14). */
    efxIsTestStart(): boolean {
      if (!this.efxIsWord("test")) return false
      const rest = this.input.slice(
        this.end,
        this.input.indexOf("\n", this.end) === -1 ? undefined : this.input.indexOf("\n", this.end)
      )
      return /^\s*(?:\.\s*(?:live|skip|only)\s*)?["']/.test(rest)
    }

    efxParseTest(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.modifier = null
      if (this.eat(tt.dot)) node.modifier = this.parseIdent(true).name
      node.name = this.parseExprAtom(null, false, false)
      node.body = this.efxParseAsyncBlock()
      this.finishNode(node, "TestStatement")
      this.efxAttachPipes(node)
      return node
    }

    /** `layer Name = …` / `atom name = …` (§4.14). */
    efxIsBindingDeclarationStart(keyword: string): boolean {
      if (!this.efxIsWord(keyword) || !this.efxNextIsNameSameLine()) return false
      const name = this.lookahead()
      const after = skipSpace(this.input, name.end)
      return this.input[after] === "=" && this.input[after + 1] !== "=" && this.input[after + 1] !== ">"
    }

    efxParseBindingDeclaration(type: string): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.id = this.parseIdent()
      this.expect(tt.eq)
      node.init = this.parseMaybeAssign()
      this.semicolon()
      return this.finishNode(node, type)
    }

    efxIsMainStart(): boolean {
      if (!this.efxIsWord("main")) return false
      const next = this.lookahead()
      return next.type === tt.braceL && this.efxSameLine(next)
    }

    efxParseMain(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.body = this.efxParseAsyncBlock()
      this.finishNode(node, "MainStatement")
      this.efxAttachPipes(node)
      return node
    }

    efxIsMatchAhead(): boolean {
      if (!this.efxIsWord("match")) return false
      const next = this.lookahead()
      if (next.type !== tt.parenL || !this.efxSameLine(next)) return false
      const end = skipBalancedTokens(this.input, next.start)
      if (end === -1) return false
      const after = skipSpace(this.input, end)
      return this.input[after] === "{" && !lineBreak.test(this.input.slice(end, after))
    }

    efxParseMatchPattern(): any {
      const node = this.startNode()
      if (
        this.type === tt.string || this.type === tt.num || this.type === tt._true || this.type === tt._false ||
        this.type === tt._null || this.efxIsWord("undefined")
      ) {
        node.value = this.efxIsWord("undefined") ? this.parseIdent() : this.parseExprAtom(null, false, false)
        return this.finishNode(node, "LiteralPattern")
      }
      let tag = this.parseIdent()
      while (this.eat(tt.dot)) {
        const member = this.startNodeAt(tag.start, tag.loc.start)
        member.object = tag
        member.property = this.parseIdent(true)
        member.computed = false
        tag = this.finishNode(member, "MemberExpression")
      }
      node.tag = tag
      node.binding = null
      if (this.eat(tt.parenL)) {
        node.binding = this.parseBindingAtom()
        this.expect(tt.parenR)
      }
      return this.finishNode(node, "TagPattern")
    }

    efxParseMatch(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      this.expect(tt.parenL)
      node.discriminant = this.parseExpression()
      this.expect(tt.parenR)
      this.expect(tt.braceL)
      node.arms = []
      while (!this.eat(tt.braceR)) {
        const arm = this.startNode()
        if (this.type === tt._default) {
          this.next()
          arm.pattern = null
        } else if (this.efxIsWord("when")) {
          this.next()
          arm.pattern = this.efxParseMatchPattern()
        } else {
          this.unexpected()
        }
        this.expect(tt.colon)
        arm.body = this.parseMaybeAssign()
        if (!this.eat(tt.semi)) this.eat(tt.comma)
        node.arms.push(this.finishNode(arm, "MatchArm"))
      }
      return this.finishNode(node, "MatchExpression")
    }
  }
