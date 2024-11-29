import { RunErrorField } from '@latitude-data/core/repositories'
import { Alert } from '@latitude-data/web-ui'
import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'

export function RunErrorMessage({ error }: { error: RunErrorField }) {
  const resultError = getRunErrorFromErrorable(error)

  if (!resultError) return null

  let message = resultError.message
  if (resultError.details) {
    const keys = Object.keys(resultError.details)
    for (const key of keys) {
      // @ts-ignore
      message += `\n${key}: ${resultError.details[key]}`
    }
  }

  return (
    <Alert
      showIcon={false}
      variant='destructive'
      title='Error message'
      description={message}
    />
  )
}
