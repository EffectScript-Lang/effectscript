/** The VS Code extension's EffectScript grammar (ADR-0041), for Shiki in the browser. */
import injection from "../../../vscode/syntaxes/effectscript.injection.tmLanguage.json" with { type: "json" }
import base from "../../../vscode/syntaxes/effectscript.tmLanguage.json" with { type: "json" }

export const efxGrammars = [
  { ...base, name: "efx", embeddedLangs: ["tsx"] },
  { ...injection, name: "efx-injection", injectTo: ["source.efx"] }
] as Array<any>
