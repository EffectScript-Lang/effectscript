/**
 * A conversion worker for `convertRepoParallel` (ADR-0094): converts its share of a project's
 * files and posts each result back.
 *
 * @since 4.0.0
 */
import { parentPort, workerData } from "node:worker_threads"
import { convertFile } from "./convert.ts"

const { dir, files } = workerData as { readonly dir: string; readonly files: ReadonlyArray<string> }
for (const file of files) parentPort!.postMessage(convertFile(dir, file))
