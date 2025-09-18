import { startDefaultWorker } from './worker-definitions/defaultWorker'
import { startDocumentSuggestionsWorker } from './worker-definitions/documentSuggestionsWorker'
import { startDocumentsWorker } from './worker-definitions/documentsWorker'
import { startEvaluationsWorker } from './worker-definitions/evaluationsWorker'
import {
  startEventHandlersWorker,
  startEventsWorker,
} from './worker-definitions/eventsWorker'
import { startMaintenanceWorker } from './worker-definitions/maintenanceWorker'
import { startTracingWorker } from './worker-definitions/tracingWorker'
import { startWebhooksWorker } from './worker-definitions/webhooksWorker'

export async function startWorkers() {
  const defaultWorker = startDefaultWorker()
  const evaluationsWorker = startEvaluationsWorker()
  const eventsWorker = startEventsWorker()
  const eventHandlersWorker = startEventHandlersWorker()
  const maintenanceWorker = startMaintenanceWorker()
  const webhooksWorker = startWebhooksWorker()
  const documentsWorker = startDocumentsWorker()
  const documentSuggestionsWorker = startDocumentSuggestionsWorker()
  const tracingWorker = startTracingWorker()

  const workers = [
    defaultWorker,
    evaluationsWorker,
    eventsWorker,
    eventHandlersWorker,
    maintenanceWorker,
    webhooksWorker,
    documentsWorker,
    documentSuggestionsWorker,
    tracingWorker,
  ]

  return Promise.all(workers)
}
