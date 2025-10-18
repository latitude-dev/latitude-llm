import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { RunErrorField } from '@latitude-data/core/repositories'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

export function RunErrorMessage({ error }: { error: RunErrorField }) {
  const resultError = getRunErrorFromErrorable(error)

  if (!resultError) return null

  let message = resultError.message
  if (resultError.details) {
    const keys = Object.keys(resultError.details).filter(
      (key) => key !== 'stack',
    )
    for (const key of keys) {
      // @ts-expect-error ts(7053)
      message += `\n${key}: ${resultError.details[key]}`
    }
  }

  return (
    <Alert
      variant='destructive'
      showIcon={false}
      title='Run failed'
      description={message}
    />
  )
}
