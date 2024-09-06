import { DocumentLogCreatedEvent } from '.'
import { enqueueDocumentLogEvaluations } from '../../services/evaluations'

export const documentLogCreatedHandler = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  enqueueDocumentLogEvaluations(event.data)
}
