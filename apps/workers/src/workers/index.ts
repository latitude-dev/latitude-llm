import { maintenanceQueue } from '@latitude-data/core/queues'
import { startDefaultWorker } from './worker-definitions/defaultWorker'
import { startDocumentSuggestionsWorker } from './worker-definitions/documentSuggestionsWorker'
import { startDocumentsWorker } from './worker-definitions/documentsWorker'
import { startEvaluationsWorker } from './worker-definitions/evaluationsWorker'
import {
  startEventHandlersWorker,
  startEventsWorker,
} from './worker-definitions/eventsWorker'
import { startLiveEvaluationsWorker } from './worker-definitions/liveEvaluationsWorker'
import { startMaintenanceWorker } from './worker-definitions/maintenanceWorker'
import { startTracingWorker } from './worker-definitions/tracingWorker'
import { startWebhooksWorker } from './worker-definitions/webhooksWorker'

export async function startWorkers() {
  const defaultWorker = startDefaultWorker()
  const evaluationsWorker = startEvaluationsWorker()
  const eventsWorker = startEventsWorker()
  const eventHandlersWorker = startEventHandlersWorker()
  const liveEvaluationsWorker = startLiveEvaluationsWorker()
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
    liveEvaluationsWorker,
    maintenanceWorker,
    webhooksWorker,
    documentsWorker,
    documentSuggestionsWorker,
    tracingWorker,
  ]

  return Promise.all(workers)
}

export async function setupSchedules() {
  // Every day at 8 AM
  await maintenanceQueue.upsertJobScheduler(
    'requestDocumentSuggestionsJob',
    { pattern: '0 0 8 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every 10 minutes
  await maintenanceQueue.upsertJobScheduler(
    'autoScaleJob',
    { pattern: '*/10 * * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 2 AM
  await maintenanceQueue.upsertJobScheduler(
    'cleanDocumentSuggestionsJob',
    { pattern: '0 0 2 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every minute
  await maintenanceQueue.upsertJobScheduler(
    'checkScheduledDocumentTriggersJob',
    { pattern: '* * * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 3 AM
  await maintenanceQueue.upsertJobScheduler(
    'refreshProjectsStatsCacheJob',
    { pattern: '0 0 3 * * *' },
    { opts: { attempts: 1 } },
  )

  // Every day at 4 AM
  await maintenanceQueue.upsertJobScheduler(
    'refreshDocumentsStatsCacheJob',
    { pattern: '0 0 4 * * *' },
    { opts: { attempts: 1 } },
  )
}
