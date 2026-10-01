/**
 * The EffectScript acorn plugin. It extends `@sveltejs/acorn-typescript`'s parser.
 *
 * acorn's parser internals are untyped, so this module works with `any`-typed parser instances.
 *
 * @since 0.1.0
 */
import * as acorn from "acorn"

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
}

/**
 * @since 0.1.0
 */
export const efxPlugin = (Base: any): any =>
  class EfxParser extends Base {
    efxState(): EfxState {
      return (this.efx ??= { pipeDepth: 0, arrowStarts: new Set<number>() })
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
  }
