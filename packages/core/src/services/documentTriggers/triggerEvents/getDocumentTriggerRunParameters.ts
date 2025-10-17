import {
  DocumentTriggerType,
  DocumentTriggerParameters,
} from '@latitude-data/constants'
import { type DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'
import { type DocumentTriggerEvent } from '../../../schema/models/types/DocumentTriggerEvent'

function getEmailTriggerEventRunParameters({
  documentTrigger,
  documentTriggerEvent,
}: {
  documentTrigger: DocumentTrigger<DocumentTriggerType.Email>
  documentTriggerEvent: DocumentTriggerEvent<DocumentTriggerType.Email>
}): Record<string, unknown> | null {
  return Object.fromEntries(
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
  )
}
function getIntegrationTriggerEventRunParameters({
  documentTrigger,
  documentTriggerEvent,
}: {
  documentTrigger: DocumentTrigger<DocumentTriggerType.Integration>
  documentTriggerEvent: DocumentTriggerEvent<DocumentTriggerType.Integration>
}) {
  return Object.fromEntries(
    documentTrigger.configuration.payloadParameters.map((paramName) => [
      paramName,
      documentTriggerEvent.payload,
    ]),
  )
}

export function getDocumentTriggerEventRunParameters<
  T extends DocumentTriggerType,
>({
  documentTrigger,
  documentTriggerEvent,
}: {
  documentTrigger: DocumentTrigger<T>
  documentTriggerEvent: DocumentTriggerEvent<T>
}) {
  if (documentTrigger.triggerType === DocumentTriggerType.Scheduled) return {}

  if (documentTrigger.triggerType === DocumentTriggerType.Email) {
    return getEmailTriggerEventRunParameters({
      documentTrigger:
        documentTrigger as DocumentTrigger<DocumentTriggerType.Email>,
      documentTriggerEvent:
        documentTriggerEvent as DocumentTriggerEvent<DocumentTriggerType.Email>,
    })
  }

  if (documentTrigger.triggerType === DocumentTriggerType.Integration) {
    return getIntegrationTriggerEventRunParameters({
      documentTrigger:
        documentTrigger as DocumentTrigger<DocumentTriggerType.Integration>,
      documentTriggerEvent:
        documentTriggerEvent as DocumentTriggerEvent<DocumentTriggerType.Integration>,
    })
  }

  return null
}
