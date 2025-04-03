import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

// Events Queue job mappings
const eventsJobMappings = {
  publishEvent: jobs.publishEventJob,
  createEvent: jobs.createEventJob,
  publishToAnalytics: jobs.publishToAnalyticsJob,
}

// Event Handlers Queue job mappings
const eventHandlersJobMappings = {
  createClaimInvitationReferral: jobs.createClaimInvitationReferralJob,
  createDocumentLogsFromSpans: jobs.createDocumentLogsFromSpansJob,
  createLoopsContact: jobs.createLoopsContact,
  notifyClientOfBulkCreateTracesAndSpans:
    jobs.notifyClientOfBulkCreateTracesAndSpans,
  notifyToClientDocumentLogCreated: jobs.notifyToClientDocumentLogCreatedJob,
  notifyClientOfDocumentSuggestionCreated:
    jobs.notifyClientOfDocumentSuggestionCreated,
  notifyClientOfEvaluationResultV2Created:
    jobs.notifyClientOfEvaluationResultV2Created,
  notifyToClientEvaluationResultCreated:
    jobs.notifyToClientEvaluationResultCreatedJob,
  notifyClientOfScaleUpMcpServer: jobs.notifyClientOfScaleUpMcpServer,
  notifyClientOfMcpServerConnected: jobs.notifyClientOfMcpServerConnected,
  sendInvitationToUser: jobs.sendInvitationToUserJob,
  sendMagicLink: jobs.sendMagicLinkJob,
  sendReferralInvitation: jobs.sendReferralInvitationJob,
  sendSuggestionNotification: jobs.sendSuggestionNotification,
  requestDocumentSuggestion: jobs.requestDocumentSuggestionJob,
  requestDocumentSuggestionV2: jobs.requestDocumentSuggestionJobV2,
  createDatasetRows: jobs.createDatasetRowsJob,
}

export function startEventsWorker() {
  return createWorker(Queues.eventsQueue, eventsJobMappings)
}

export function startEventHandlersWorker() {
  return createWorker(Queues.eventHandlersQueue, eventHandlersJobMappings)
}
