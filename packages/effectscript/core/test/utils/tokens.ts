import ts from "typescript"

/** Tokens after which a line break ends the statement (the restricted productions). */
const restricted = new Set(["return", "throw", "yield", "break", "continue", "async"])

/**
 * Code tokens (without trailing commas) and comments, for ADR-0030's token- and
 * comment-equivalence check. Scanner mistakes on templates/regexes are consistent between the two
 * sides of a comparison, so they don't hide differences.
 */
export const tokensAndComments = (source: string): { tokens: Array<string>; comments: Array<string> } => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source)
  const tokens: Array<string> = []
  const comments: Array<string> = []
  // open braces per enclosing template `${`, so a `}` that closes a substitution rescans as template text
  const templates: Array<number> = []
  let lineBreak = false
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.NewLineTrivia) lineBreak = true
    if (kind === ts.SyntaxKind.WhitespaceTrivia || kind === ts.SyntaxKind.NewLineTrivia) continue
    if (kind === ts.SyntaxKind.TemplateHead) templates.push(0)
    else if (kind === ts.SyntaxKind.OpenBraceToken && templates.length > 0) templates[templates.length - 1]!++
    else if (kind === ts.SyntaxKind.CloseBraceToken && templates.length > 0) {
      if (templates[templates.length - 1] === 0) {
        kind = scanner.reScanTemplateToken(false)
        if (kind === ts.SyntaxKind.TemplateTail) templates.pop()
      } else {
        templates[templates.length - 1]!--
      }
    }
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      comments.push(scanner.getTokenText())
      if (scanner.getTokenText().includes("\n")) lineBreak = true
      continue
    }
    // a line break after `return`/`throw`/… or before `++`/`--` changes the program (ASI)
    const text = scanner.getTokenText()
    const previous = tokens[tokens.length - 1]
    if (lineBreak && (restricted.has(previous ?? "") || text === "++" || text === "--")) tokens.push("\u2424")
    lineBreak = false
    tokens.push(text)
  }
  return { tokens: tokens.filter((t, i) => !(t === "," && [")", "]", "}"].includes(tokens[i + 1]!))), comments }
}
