'use server'

import { runDocumentVersion, streamToGenerator } from '@latitude-data/core'
import { getDocumentByIdCached } from '$/app/(private)/_data-access'
import { createStreamableValue } from 'ai/rsc'

export async function runAction({
  id,
  parameters,
}: {
  id: number
  parameters: Record<string, unknown>
}) {
  const document = await getDocumentByIdCached(id)
  const stream = createStreamableValue()

  ;(async () => {
    const result = await runDocumentVersion({ document, parameters }).then(
      (r) => r.unwrap(),
    )

    try {
      for await (const value of streamToGenerator(result.stream)) {
        stream.update(value)
      }

      stream.done()
    } catch (error) {
      const err = error as Error
      stream.error({
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    }
  })()

  return {
    output: stream.value,
  }
}
