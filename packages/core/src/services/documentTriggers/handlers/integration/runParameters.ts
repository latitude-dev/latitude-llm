import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTrigger, DocumentTriggerEvent } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'

export async function getIntegrationTriggerEventRunParameters({
  documentTrigger,
  documentTriggerEvent,
}: {
  documentTrigger: DocumentTrigger<DocumentTriggerType.Integration>
  documentTriggerEvent: DocumentTriggerEvent<DocumentTriggerType.Integration>
}): PromisedResult<Record<string, unknown>> {
  return Result.ok(
    Object.fromEntries(
      documentTrigger.configuration.payloadParameters.map((paramName) => [
        paramName,
        documentTriggerEvent.payload,
      ]),
    ),
  )
}
