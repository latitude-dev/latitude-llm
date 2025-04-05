import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
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
  createDocumentLogsFromSpansJob: jobs.createDocumentLogsFromSpansJob,
  createLoopsContact: jobs.createLoopsContact,
  notifyClientOfBulkCreateTracesAndSpans:
    jobs.notifyClientOfBulkCreateTracesAndSpans,
  notifyToClientDocumentLogCreatedJob: jobs.notifyToClientDocumentLogCreatedJob,
  notifyClientOfDocumentSuggestionCreated:
    jobs.notifyClientOfDocumentSuggestionCreated,
  notifyClientOfEvaluationResultV2Created:
    jobs.notifyClientOfEvaluationResultV2Created,
  notifyToClientEvaluationResultCreatedJob:
    jobs.notifyToClientEvaluationResultCreatedJob,
  notifyClientOfScaleUpMcpServer: jobs.notifyClientOfScaleUpMcpServer,
  notifyClientOfMcpServerConnected: jobs.notifyClientOfMcpServerConnected,
  sendInvitationToUserJob: jobs.sendInvitationToUserJob,
  sendMagicLinkJob: jobs.sendMagicLinkJob,
  sendReferralInvitationJob: jobs.sendReferralInvitationJob,
  sendSuggestionNotification: jobs.sendSuggestionNotification,
  requestDocumentSuggestionJob: jobs.requestDocumentSuggestionJob,
  requestDocumentSuggestionJobV2: jobs.requestDocumentSuggestionJobV2,
  createDatasetRowsJob: jobs.createDatasetRowsJob,
  runLiveEvaluationsJob: jobs.runLiveEvaluationsJob,
  evaluateLiveLogJob: jobs.evaluateLiveLogJob,
  updateWebhookLastTriggeredAt: jobs.updateWebhookLastTriggeredAt,
}

export function startEventsWorker() {
  return createWorker(Queues.eventsQueue, eventsJobMappings)
}

export function startEventHandlersWorker() {
  return createWorker(Queues.eventHandlersQueue, eventHandlersJobMappings)
}
