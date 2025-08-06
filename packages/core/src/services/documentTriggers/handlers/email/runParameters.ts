import {
  DocumentTriggerParameters,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { DocumentTrigger, DocumentTriggerEvent } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'

export async function getEmailTriggerEventRunParameters({
  documentTrigger,
  documentTriggerEvent,
}: {
  documentTrigger: DocumentTrigger<DocumentTriggerType.Email>
  documentTriggerEvent: DocumentTriggerEvent<DocumentTriggerType.Email>
}): PromisedResult<Record<string, unknown>> {
  return Result.ok(
    Object.fromEntries(
      Object.entries(documentTrigger.configuration.parameters ?? {}).map(
        ([key, value]: [string, DocumentTriggerParameters]) => {
          if (value === DocumentTriggerParameters.SenderName) {
            return [key, documentTriggerEvent.payload.senderName]
          }
          if (value === DocumentTriggerParameters.SenderEmail) {
            return [key, documentTriggerEvent.payload.senderEmail]
          }
          if (value === DocumentTriggerParameters.Subject) {
            return [key, documentTriggerEvent.payload.subject]
          }
          if (value === DocumentTriggerParameters.Body) {
            return [key, documentTriggerEvent.payload.body]
          }
          if (value === DocumentTriggerParameters.Attachments) {
            return [key, documentTriggerEvent.payload.attachments ?? []]
          }
          return [key, undefined]
        },
      ),
    ),
  )
}
