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
  sendInvitationToUserJob: jobs.sendInvitationToUserJob,
  sendMagicLinkJob: jobs.sendMagicLinkJob,
  sendReferralInvitationJob: jobs.sendReferralInvitationJob,
  sendSuggestionNotification: jobs.sendSuggestionNotification,
  requestDocumentSuggestionJobV2: jobs.requestDocumentSuggestionJobV2,
  createDatasetRowsJob: jobs.createDatasetRowsJob,
  evaluateLiveLogJob: jobs.evaluateLiveLogJob,
  updateWebhookLastTriggeredAt: jobs.updateWebhookLastTriggeredAt,
  pingProjectUpdateJob: jobs.pingProjectUpdateJob,
  touchProviderApiKeyJob: jobs.touchProviderApiKeyJob,
  touchApiKeyJob: jobs.touchApiKeyJob,
  notifyClientOfExportReady: jobs.notifyClientOfExportReady,
  notifyToClientDocumentLogCreatedJob: jobs.notifyToClientDocumentLogCreatedJob,
  notifyClientOfDocumentSuggestionCreated:
    jobs.notifyClientOfDocumentSuggestionCreated,
  notifyClientOfEvaluationResultV2Created:
    jobs.notifyClientOfEvaluationResultV2Created,
  notifyClientOfScaleUpMcpServer: jobs.notifyClientOfScaleUpMcpServer,
  notifyClientOfMcpServerConnected: jobs.notifyClientOfMcpServerConnected,
  undeployDocumentTriggerJob: jobs.undeployDocumentTriggerJob,
  notifyClientOfDocumentTriggerCreated:
    jobs.notifyClientOfDocumentTriggerCreated,
  notifyClientOfDocumentTriggerDeleted:
    jobs.notifyClientOfDocumentTriggerDeleted,
  notifyClientOfDocumentTriggerEventCreated:
    jobs.notifyClientOfDocumentTriggerEventCreated,
  clearProviderApiKeysCache: jobs.clearProviderApiKeysCache,
  notifyClientOfRunStatus: jobs.notifyClientOfRunStatus,
  assignIssueToEvaluationResultV2Job: jobs.assignIssueToEvaluationResultV2Job,
  notifyClientOfEvaluationStatus: jobs.notifyClientOfEvaluationStatus,
}

export function startEventsWorker() {
  return createWorker(Queues.eventsQueue, eventsJobMappings, {
    concurrency: 100,
    connection: WORKER_CONNECTION_CONFIG,
  })
}

export function startEventHandlersWorker() {
  return createWorker(Queues.eventHandlersQueue, eventHandlersJobMappings, {
    concurrency: 100,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
