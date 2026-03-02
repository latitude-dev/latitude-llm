import { startAlignmentsWorker } from './worker-definitions/alignmentsWorker'
import { startDefaultWorker } from './worker-definitions/defaultWorker'
import { startDocumentsWorker } from './worker-definitions/documentsWorker'
import { startEvaluationsWorker } from './worker-definitions/evaluationsWorker'
import {
  startEventHandlersWorker,
  startEventsWorker,
} from './worker-definitions/eventsWorker'
import { startGenerateEvaluationWorker } from './worker-definitions/generateEvaluationWorker'
import { startIssuesWorker } from './worker-definitions/issuesWorker'
import { startLatteWorker } from './worker-definitions/latteWorker'
import { startMaintenanceWorker } from './worker-definitions/maintenanceWorker'
import { startNotificationsWorker } from './worker-definitions/notificationsWorker'
import { startOptimizationsWorker } from './worker-definitions/optimizationsWorker'
import { startRunsWorker } from './worker-definitions/runsWorker'
import { startTracingWorker } from './worker-definitions/tracingWorker'
import { startWebhooksWorker } from './worker-definitions/webhooksWorker'

export async function startWorkers() {
  const defaultWorker = startDefaultWorker()
  const evaluationsWorker = startEvaluationsWorker()
  const eventsWorker = startEventsWorker()
  const eventHandlersWorker = startEventHandlersWorker()
  const latteWorker = startLatteWorker()
  const maintenanceWorker = startMaintenanceWorker()
  const notificationsWorker = startNotificationsWorker()
  const webhooksWorker = startWebhooksWorker()
  const documentsWorker = startDocumentsWorker()
  const tracingWorker = startTracingWorker()
  const runsWorker = startRunsWorker()
  const issuesWorker = startIssuesWorker()
  const generateEvaluationWorker = startGenerateEvaluationWorker()
  const optimizationsWorker = startOptimizationsWorker()
  const alignmentsWorker = startAlignmentsWorker()

  const workers = [
    defaultWorker,
    evaluationsWorker,
    eventsWorker,
    eventHandlersWorker,
    latteWorker,
    maintenanceWorker,
    notificationsWorker,
    webhooksWorker,
    documentsWorker,
    tracingWorker,
    runsWorker,
    issuesWorker,
    generateEvaluationWorker,
    optimizationsWorker,
    alignmentsWorker,
  ]

  return Promise.all(workers)
}
