import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

// Events Queue job mappings
const eventsJobMappings = {
  publishEventJob: jobs.publishEventJob,
  createEventJob: jobs.createEventJob,
  publishToAnalyticsJob: jobs.publishToAnalyticsJob,
}

// Event Handlers Queue job mappings
const eventHandlersJobMappings = {
  createClaimInvitationReferralJob: jobs.createClaimInvitationReferralJob,
  createLoopsContact: jobs.createLoopsContact,
  updateLoopsContact: jobs.updateLoopsContact,
  sendInvitationToUserJob: jobs.sendInvitationToUserJob,
  sendMagicLinkJob: jobs.sendMagicLinkJob,
  sendReferralInvitationJob: jobs.sendReferralInvitationJob,
  createDatasetRowsJob: jobs.createDatasetRowsJob,
  evaluateLiveLogJob: jobs.evaluateLiveLogJob,
  updateWebhookLastTriggeredAt: jobs.updateWebhookLastTriggeredAt,
  pingProjectUpdateJob: jobs.pingProjectUpdateJob,
  notifyClientOfExportReady: jobs.notifyClientOfExportReady,
  notifyClientOfEvaluationResultV2Created:
    jobs.notifyClientOfEvaluationResultV2Created,
  handleEvaluationResultV2Updated: jobs.handleEvaluationResultV2Updated,
  writeEvaluationResultV2CreatedToClickhouse:
    jobs.writeEvaluationResultV2CreatedToClickhouse,
  writeEvaluationResultV2UpdatedToClickhouse:
    jobs.writeEvaluationResultV2UpdatedToClickhouse,
  undeployDocumentTriggerJob: jobs.undeployDocumentTriggerJob,
  notifyClientOfDocumentTriggerCreated:
    jobs.notifyClientOfDocumentTriggerCreated,
  notifyClientOfDocumentTriggerDeleted:
    jobs.notifyClientOfDocumentTriggerDeleted,
  notifyClientOfDocumentTriggerEventCreated:
    jobs.notifyClientOfDocumentTriggerEventCreated,
  clearProviderApiKeysCache: jobs.clearProviderApiKeysCache,
  notifyClientOfRunStatusByDocument: jobs.notifyClientOfRunStatusByDocument,
  notifyClientOfSpanCreated: jobs.notifyClientOfSpanCreated,
  assignIssueToEvaluationResultV2Job: jobs.assignIssueToEvaluationResultV2Job,
  notifyClientOfEvaluationStatus: jobs.notifyClientOfEvaluationStatus,
  sendIssueEscalatingHandler: jobs.sendIssueEscalatingHandler,
  removeMergedIssueVectors: jobs.removeMergedIssueVectors,
  generateDetailsForMergedIssue: jobs.generateDetailsForMergedIssue,
  notifyClientOfCommitUpdated: jobs.notifyClientOfCommitUpdated,
  stopDeploymentTestsForCommitHandler: jobs.stopDeploymentTestsForCommitHandler,
  enqueueShadowTestChallengerHandler: jobs.enqueueShadowTestChallengerHandler,
  notifyClientOfEvaluationV2AlignmentUpdated:
    jobs.notifyClientOfEvaluationV2AlignmentUpdated,
  notifyClientOfOptimizationStatus: jobs.notifyClientOfOptimizationStatus,
  unassignIssuesOnDocumentsDeleted: jobs.unassignIssuesOnDocumentsDeleted,
  createInstantlyLeadHandler: jobs.createInstantlyLeadHandler,
}

export function startEventsWorker() {
  return createWorker(Queues.eventsQueue, eventsJobMappings, {
    concurrency: 10,
    connection: WORKER_CONNECTION_CONFIG,
  })
}

export function startEventHandlersWorker() {
  return createWorker(Queues.eventHandlersQueue, eventHandlersJobMappings, {
    concurrency: 10,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
