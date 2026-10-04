# ADR-0092: Tokens are counted with Hugging Face tokenizers, against a panel of frontier vocabularies

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user (move to `huggingface/tokenizers`, use what current labs use); agent ruling
  on the panel, the pinning and the cache
- **Related:** ADR-0054 (amended), ADR-0082, ADR-0091; spec §9.2; `packages/effectscript/tokens`

## Context

EffectScript's claim is "fewer tokens, same intent", and it is checked by numbers in two places:

- the site's gallery and landing page counted `o200k_base` with `gpt-tokenizer`, a JavaScript port;
- the effect-docs `REPORT.md` counted TypeScript *scanner* tokens, a different measure that no model
  reads.

ADR-0091 starts an audit that uses token counts to decide syntax, so the measure has to be one
measure, fast enough to run over the 4,000-example docs corpus, and not an artifact of one
vocabulary. `huggingface/tokenizers` is the Rust library most labs ship their tokenizers for. Its
Node binding (`tokenizers` on npm) loads any `tokenizer.json`.

The frontier vocabularies published as ungated `tokenizer.json` files in October 2026:

| id            | lab      | models                                    | Hub file                              |
| ------------- | -------- | ----------------------------------------- | ------------------------------------- |
| `o200k`       | OpenAI   | GPT-4o, GPT-4.1, GPT-5, o-series, gpt-oss | `openai/gpt-oss-20b`                  |
| `qwen3`       | Qwen     | Qwen3, Qwen3-Coder                        | `Qwen/Qwen3-Coder-30B-A3B-Instruct`   |
| `deepseek-v3` | DeepSeek | DeepSeek-V3, V3.1, V3.2                   | `deepseek-ai/DeepSeek-V3.2-Exp`       |
| `glm-4.6`     | Z.ai     | GLM-4.5, GLM-4.6                          | `zai-org/GLM-4.6`                     |

Anthropic's and Google's tokenizers aren't published. Llama 4's and Gemma 3's are gated. Kimi K2
and Mistral ship other formats.

Measured on the gallery's 20 files, the HF `o200k` gives exactly `gpt-tokenizer`'s counts on every
file, and batch-encodes in about half the time. On the corpus, the four vocabularies agree on
EffectScript's saving to within 0.3 points (13.9–14.2%).

## Decision

- **One package counts tokens:** `@effectscript/tokens` (private, `packages/effectscript/tokens`),
  on `tokenizers` (the `huggingface/tokenizers` Node binding), pinned to an exact version.
  - `count(texts, vocabulary?)`: tokens per text, no special tokens.
  - `panel(texts)`: the same, for every vocabulary.
  - `pieces(text, vocabulary?)`: the text split at token boundaries, for the gallery's
    "show tokens" toggle. A character split across tokens stays in one piece.
- **`o200k` is the primary vocabulary.** It's what the site shows and what `REPORT.md`'s main
  tables count. It is the most used vocabulary today, and it's continuous with the numbers
  already published.
- **The panel is the four vocabularies above.** `REPORT.md` reports the corpus saving in each. A
  syntax decision that the audit (ADR-0091) justifies by tokens must hold across the panel, not
  only in `o200k`.
- **Vocabularies are pinned and verified.** Each one names its Hub repository, revision and the
  SHA-256 of its `tokenizer.json`. The file is downloaded on first use into
  `$EFFECTSCRIPT_TOKENIZERS` (default `~/.cache/effectscript/tokenizers`) and checked. A mismatch
  is an error, not a silent re-download of something else. The files (7–28 MB each) are not
  checked in.
- **Scanner tokens are gone.** `tokens()` in `effect-docs/translate` is removed. Every count in the
  repository is a BPE count from this package.
- **Adding a vocabulary** (a new frontier model, or Anthropic's if it's published) means adding an
  entry with its pinned revision and hash. The panel is a list, not a policy.

## Consequences

- One number, one tool: the gallery, the landing page and `REPORT.md` can't disagree about what a
  token is.
- The first build or test run on a machine needs network access to the Hub, about 60 MB in all,
  once. Offline machines can pre-fill `$EFFECTSCRIPT_TOKENIZERS`.
- Counting is async (the binding's `encode` returns a promise). `gallery()` and the effect-docs
  `generate()` became async, and the landing page's data awaits them at the top level.
- The `tokenizers` binding is native. It runs in Node, which is where the site is built. The spec's
  in-browser live counts (§9.2) would need Hugging Face's pure-JS `@huggingface/tokenizers`
  reading the same pinned file. That's a separate decision when the playground needs it.
- The published counts don't change: same vocabulary, same numbers.

## Alternatives considered

- **Keep `gpt-tokenizer`:** it's correct for `o200k`, but it's one vocabulary in a JavaScript port,
  and it can't load other labs' tokenizers. The audit needs a panel.
- **`@huggingface/tokenizers` (pure JS) everywhere:** it runs in the browser too, but the user
  asked for the Rust library, and the corpus is counted in Node, where the native binding is
  faster. It stays the path for in-browser counts.
- **Count with Anthropic's `count_tokens` API:** it needs a key and the network on every build, and
  it can't split text into pieces. It may join the panel as an optional, cached extra.
- **Check the `tokenizer.json` files in:** 60 MB of vendored JSON in a git history, for files the
  Hub serves immutably by revision.
- **One vocabulary only (`o200k`):** cheaper, but a syntax choice could win on one BPE's merges and
  lose on another's. The panel costs a second of loading.
