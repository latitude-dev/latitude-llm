import { RunErrorField } from '@latitude-data/core'

export function getRunErrorFromErrorable(error: RunErrorField) {
  if (!error.code || !error.message) return null

  return {
    code: error.code!,
    message: error.message!,
    details: error.details,
  }
}
