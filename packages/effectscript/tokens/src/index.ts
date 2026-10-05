/**
 * Token counts for EffectScript's samples and docs (ADR-0093): Hugging Face `tokenizers` running the
 * vocabularies of current frontier models. `o200k` is the one the site shows; the others are a
 * panel that checks a compression isn't an artifact of one vocabulary (ADR-0092).
 *
 * Each vocabulary's `tokenizer.json` is downloaded once from the Hugging Face Hub, pinned by
 * revision and checked against its SHA-256, and kept in `$EFFECTSCRIPT_TOKENIZERS` (by default
 * `~/.cache/effectscript/tokenizers`).
 *
 * @since 4.0.0
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Tokenizer } from "tokenizers"

/**
 * A model family's vocabulary, pinned to one file on the Hub.
 *
 * @since 4.0.0
 * @category vocabularies
 */
export interface Vocabulary {
  readonly id: string
  readonly lab: string
  /** The models that use it. */
  readonly models: string
  readonly repo: string
  readonly revision: string
  readonly sha256: string
}

/**
 * The panel: every frontier vocabulary published as an ungated `tokenizer.json` (October 2026).
 * Anthropic's and Google's aren't published; Llama 4's and Gemma 3's are gated.
 *
 * @since 4.0.0
 * @category vocabularies
 */
export const vocabularies = [
  {
    id: "o200k",
    lab: "OpenAI",
    models: "GPT-4o, GPT-4.1, GPT-5, o-series, gpt-oss",
    repo: "openai/gpt-oss-20b",
    revision: "6cee5e81ee83917806bbde320786a8fb61efebee",
    sha256: "0614fe83cadab421296e664e1f48f4261fa8fef6e03e63bb75c20f38e37d07d3"
  },
  {
    id: "qwen3",
    lab: "Qwen",
    models: "Qwen3, Qwen3-Coder",
    repo: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    revision: "b2cff646eb4bb1d68355c01b18ae02e7cf42d120",
    sha256: "19564a48c4f71a2a1b937cce34c737a1e662b171c5f5d7edf641a15cd896f07d"
  },
  {
    id: "deepseek-v3",
    lab: "DeepSeek",
    models: "DeepSeek-V3, V3.1, V3.2",
    repo: "deepseek-ai/DeepSeek-V3.2-Exp",
    revision: "194c67e12b1b0d6df0ef373ddcf215bc84027409",
    sha256: "32b34a41212e92f62e859cbbea121ae705a1fabbf157d9acf22d134ecd8dcf70"
  },
  {
    id: "glm-4.6",
    lab: "Z.ai",
    models: "GLM-4.5, GLM-4.6",
    repo: "zai-org/GLM-4.6",
    revision: "be72194883d968d7923a07e2f61681ea9a2826d1",
    sha256: "9340665016419c825c4bdabbcc9acc43b7ca2c68ce142724afa829abb1be5efd"
  }
] as const satisfies ReadonlyArray<Vocabulary>

/**
 * The vocabulary the site and the docs report: `o200k`, the most widely used one.
 *
 * @since 4.0.0
 * @category vocabularies
 */
export const primary: Vocabulary = vocabularies[0]

const cacheDir = (): string =>
  process.env.EFFECTSCRIPT_TOKENIZERS ?? path.join(os.homedir(), ".cache", "effectscript", "tokenizers")

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

const download = async (vocabulary: Vocabulary, file: string): Promise<Uint8Array> => {
  const url = `https://huggingface.co/${vocabulary.repo}/resolve/${vocabulary.revision}/tokenizer.json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`downloading ${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (sha256(bytes) !== vocabulary.sha256) throw new Error(`${url} doesn't match its pinned SHA-256`)
  await mkdir(path.dirname(file), { recursive: true })
  const partial = `${file}.${process.pid}.partial`
  await writeFile(partial, bytes)
  await rename(partial, file)
  return bytes
}

const load = async (vocabulary: Vocabulary): Promise<Tokenizer> => {
  const file = path.join(cacheDir(), `${vocabulary.id}-${vocabulary.revision.slice(0, 12)}.json`)
  let bytes: Uint8Array | undefined
  try {
    bytes = await readFile(file)
  } catch {
    // not downloaded yet
  }
  if (bytes === undefined || sha256(bytes) !== vocabulary.sha256) bytes = await download(vocabulary, file)
  return Tokenizer.fromString(new TextDecoder().decode(bytes))
}

const loaded = new Map<string, Promise<Tokenizer>>()

/**
 * The vocabulary's tokenizer, loaded once per process.
 *
 * @since 4.0.0
 * @category tokenizers
 */
export const tokenizer = (vocabulary: Vocabulary = primary): Promise<Tokenizer> => {
  let pending = loaded.get(vocabulary.id)
  if (pending === undefined) {
    pending = load(vocabulary)
    loaded.set(vocabulary.id, pending)
    pending.catch(() => loaded.delete(vocabulary.id))
  }
  return pending
}

/**
 * The number of tokens in each text, without special tokens.
 *
 * @since 4.0.0
 * @category counting
 */
export const count = async (texts: ReadonlyArray<string>, vocabulary: Vocabulary = primary): Promise<Array<number>> => {
  if (texts.length === 0) return []
  const encodings = await (await tokenizer(vocabulary)).encodeBatch([...texts], { addSpecialTokens: false })
  return encodings.map((encoding) => encoding.getIds().length)
}

/**
 * The tokens of every text in every vocabulary of the panel, by vocabulary id.
 *
 * @since 4.0.0
 * @category counting
 */
export const panel = async (texts: ReadonlyArray<string>): Promise<Record<string, Array<number>>> =>
  Object.fromEntries(await Promise.all(vocabularies.map(async (v) => [v.id, await count(texts, v)] as const)))

/**
 * The text split at token boundaries. A character that spans tokens (é, 🎉, 日) keeps those tokens
 * together, so every piece is whole text and the pieces join back to the input.
 *
 * @since 4.0.0
 * @category counting
 */
export const pieces = async (text: string, vocabulary: Vocabulary = primary): Promise<Array<string>> => {
  const encoding = await (await tokenizer(vocabulary)).encode(text, undefined, { addSpecialTokens: false })
  // offsets are in code points; a split character shows up as overlapping ranges
  const chars = Array.from(text)
  const out: Array<string> = []
  let start = 0
  let end = 0
  for (const [from, to] of encoding.getOffsets()) {
    if (from! >= end && end > start) {
      out.push(chars.slice(start, end).join(""))
      start = end
    }
    end = Math.max(end, to!)
  }
  if (end > start) out.push(chars.slice(start, end).join(""))
  if (end < chars.length) out.push(chars.slice(end).join(""))
  return out
}
