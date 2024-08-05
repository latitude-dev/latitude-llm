'use server'

import { runDocumentVersion, streamToGenerator } from '@latitude-data/core'
import type { Commit } from '@latitude-data/core/browser'
import { createStreamableValue } from 'ai/rsc'

export async function runAction({
  documentUuid,
  commit,
  parameters,
}: {
  documentUuid: string
  commit: Commit
  parameters: Record<string, unknown>
}) {
  const stream = createStreamableValue()

  ;(async () => {
    const result = await runDocumentVersion({
      documentUuid,
      commit,
      parameters,
    }).then((r) => r.unwrap())

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
