import { maintenanceQueue } from '@latitude-data/core/queues'
import { startMaintenanceWorker } from './worker-definitions/maintenanceWorker'
import {
  startEventsWorker,
  startEventHandlersWorker,
} from './worker-definitions/eventsWorker'
import { startEvaluationsWorker } from './worker-definitions/evaluationsWorker'
import { startWebhooksWorker } from './worker-definitions/webhooksWorker'
import { startDocumentsWorker } from './worker-definitions/documentsWorker'
import { startDefaultWorker } from './worker-definitions/defaultWorker'
import { startLiveEvaluationsWorker } from './worker-definitions/liveEvaluationsWorker'

export async function startWorkers() {
  const defaultWorker = startDefaultWorker()
  const evaluationsWorker = startEvaluationsWorker()
  const eventsWorker = startEventsWorker()
  const eventHandlersWorker = startEventHandlersWorker()
  const liveEvaluationsWorker = startLiveEvaluationsWorker()
  const maintenanceWorker = startMaintenanceWorker()
  const webhooksWorker = startWebhooksWorker()
  const documentsWorker = startDocumentsWorker()

  return {
    defaultWorker,
    evaluationsWorker,
    eventsWorker,
    eventHandlersWorker,
    liveEvaluationsWorker,
    maintenanceWorker,
    webhooksWorker,
    documentsWorker,
  }
}

export async function setupSchedules() {
  // Every day at 8 AM
  await maintenanceQueue.upsertJobScheduler(
    'requestDocumentSuggestionsJob',
    {
      pattern: '0 0 8 * * *',
    },
    { opts: { attempts: 1 } },
  )

  // Every 10 minutes
  await maintenanceQueue.upsertJobScheduler(
    'autoScaleJob',
    {
      pattern: '*/10 * * * *',
    },
    { opts: { attempts: 1 } },
  )

  // Every day at 2 AM
  await maintenanceQueue.upsertJobScheduler(
    'cleanDocumentSuggestionsJob',
    {
      pattern: '0 0 2 * * *',
    },
    { opts: { attempts: 1 } },
  )

  // Every minute
  await maintenanceQueue.upsertJobScheduler(
    'checkScheduledDocumentTriggersJob',
    {
      pattern: '* * * * *',
    },
    { opts: { attempts: 1 } },
  )

  // Every day at 3 AM - Refresh project stats cache
  await maintenanceQueue.upsertJobScheduler(
    'refreshProjectStatsCacheJob',
    {
      pattern: '0 0 3 * * *',
    },
    { opts: { attempts: 1 } },
  )
}
