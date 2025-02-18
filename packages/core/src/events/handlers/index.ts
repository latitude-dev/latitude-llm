import { IEventsHandlers } from '../events'
import { createClaimInvitationReferralJob } from './createClaimInvitationReferralJob'
import { createDocumentLogsFromSpansJob } from './createDocumentLogsFromSpansJob'
import { createLoopsContact } from './createLoopsContact'
import { notifyClientOfBulkCreateTracesAndSpans } from './notifyClientOfBulkCreateTracesAndSpans'
import { notifyClientOfDocumentSuggestionCreated } from './notifyClientOfDocumentSuggestionCreated'
import { notifyToClientDocumentLogCreatedJob } from './notifyToClientDocumentLogCreatedJob'
import { notifyToClientEvaluationResultCreatedJob } from './notifyToClientEvaluationResultCreatedJob'
import { runLiveEvaluationsJob } from './runLiveEvaluationsJob'
import { sendInvitationToUserJob } from './sendInvitationToUser'
import { sendMagicLinkJob } from './sendMagicLinkHandler'
import { sendReferralInvitationJob } from './sendReferralInvitation'

export const EventHandlers: IEventsHandlers = {
  aiProviderCallCompleted: [],
  batchEvaluationRun: [],
  claimReferralInvitations: [createClaimInvitationReferralJob],
  commitCreated: [],
  commitPublished: [],
  datasetCreated: [],
  documentCreated: [],
  documentLogCreated: [
    runLiveEvaluationsJob,
    notifyToClientDocumentLogCreatedJob,
  ],
  documentSuggestionCreated: [notifyClientOfDocumentSuggestionCreated],
  documentSuggestionApplied: [],
  documentSuggestionDiscarded: [],
  documentRun: [],
  evaluationCreated: [],
  evaluationResultCreated: [notifyToClientEvaluationResultCreatedJob],
  evaluationResultUpdated: [],
  evaluationRun: [],
  evaluationsConnected: [],
  magicLinkTokenCreated: [sendMagicLinkJob],
  membershipCreated: [sendInvitationToUserJob],
  projectCreated: [],
  providerApiKeyCreated: [],
  providerLogCreated: [],
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
  bulkCreateTracesAndSpans: [
    notifyClientOfBulkCreateTracesAndSpans,
    createDocumentLogsFromSpansJob,
  ],
}
