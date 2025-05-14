import { IEventsHandlers } from '../events'
import { createClaimInvitationReferralJob } from './createClaimInvitationReferralJob'
import { createDatasetRowsJob } from './createDatasetRowsJobs'
import { createLoopsContact } from './createLoopsContact'
import { evaluateLiveLogJob } from './evaluateLiveLog'
import { notifyClientOfDocumentSuggestionCreated } from './notifyClientOfDocumentSuggestionCreated'
import { notifyClientOfEvaluationResultV2Created } from './notifyClientOfEvaluationResultV2Created'
import { notifyClientOfMcpServerConnected } from './notifyClientOfMcpServerConnected'
import { notifyClientOfScaleUpMcpServer } from './notifyClientOfScaleUpMcpServer'
import { notifyToClientDocumentLogCreatedJob } from './notifyToClientDocumentLogCreatedJob'
import { notifyToClientEvaluationResultCreatedJob } from './notifyToClientEvaluationResultCreatedJob'
import { pingProjectUpdateJob } from './pingProjectUpdateJob'
import {
  requestDocumentSuggestionJob,
  requestDocumentSuggestionJobV2,
} from './requestDocumentSuggestionJob'
import { runLiveEvaluationsJob } from './runLiveEvaluationsJob'
import { sendInvitationToUserJob } from './sendInvitationToUser'
import { sendMagicLinkJob } from './sendMagicLinkHandler'
import { sendReferralInvitationJob } from './sendReferralInvitation'
import { sendSuggestionNotification } from './sendSuggestionNotification'
import { touchApiKeyJob } from './touchApiKeyJob'
import { touchProviderApiKeyJob } from './touchProviderApiKeyJob'
import { updateWebhookLastTriggeredAt } from './webhooks'

export const EventHandlers: IEventsHandlers = {
  aiProviderCallCompleted: [],
  batchEvaluationRun: [],
  claimReferralInvitations: [createClaimInvitationReferralJob],
  commitCreated: [],
  commitPublished: [],
  datasetCreated: [],
  datasetUploaded: [createDatasetRowsJob],
  documentCreated: [],
  documentLogCreated: [
    runLiveEvaluationsJob,
    evaluateLiveLogJob,
    notifyToClientDocumentLogCreatedJob,
  ],
  experimentVariantsCreated: [],
  documentSuggestionCreated: [
    notifyClientOfDocumentSuggestionCreated,
    sendSuggestionNotification,
  ],
  documentSuggestionApplied: [],
  documentSuggestionDiscarded: [],
  documentRun: [],
  evaluationCreated: [],
  evaluationResultCreated: [
    requestDocumentSuggestionJob,
    notifyToClientEvaluationResultCreatedJob,
  ],
  evaluationResultUpdated: [],
  evaluationRun: [],
  evaluationsConnected: [],
  magicLinkTokenCreated: [sendMagicLinkJob],
  membershipCreated: [sendInvitationToUserJob],
  projectCreated: [],
  providerApiKeyCreated: [],
  providerLogCreated: [touchProviderApiKeyJob, touchApiKeyJob],
  sendReferralInvitation: [sendReferralInvitationJob],
  userCreated: [createLoopsContact],
  userInvited: [],
  workspaceCreated: [],
  documentRunRequested: [],
  publicDocumentRunRequested: [],
  chatMessageRequested: [],
  sharedChatMessageRequested: [],
  forkDocumentRequested: [],
  batchEvaluationRunRequested: [],
  runDocumentInBatchRequested: [],
  copilotRefinerGenerated: [],
  copilotRefinerApplied: [],
  copilotSuggestionGenerated: [],
  copilotSuggestionApplied: [],
  evaluationV2Created: [pingProjectUpdateJob],
  evaluationV2Updated: [pingProjectUpdateJob],
  evaluationV2Deleted: [pingProjectUpdateJob],
  evaluationV2Ran: [],
  evaluationV2Annotated: [],
  evaluationResultV2Created: [
    requestDocumentSuggestionJobV2,
    notifyClientOfEvaluationResultV2Created,
  ],
  evaluationResultV2Updated: [],
  scaleMcpServer: [notifyClientOfScaleUpMcpServer],
  mcpServerConnected: [notifyClientOfMcpServerConnected],
  webhookDeliveryCreated: [updateWebhookLastTriggeredAt],
}
