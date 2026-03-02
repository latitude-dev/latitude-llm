import { AbortedError } from '../lib/errors'

export function raiseForAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw new AbortedError()
  }
}
