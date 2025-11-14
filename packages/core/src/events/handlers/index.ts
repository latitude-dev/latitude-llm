import { IEventsHandlers } from '../events'
import { assignIssueToEvaluationResultV2Job } from './assignIssueToEvaluationResultV2Job'
import { clearProviderApiKeysCache } from './clearProviderApiKeysCache'
import { createClaimInvitationReferralJob } from './createClaimInvitationReferralJob'
import { createDatasetRowsJob } from './createDatasetRowsJobs'
import { createLoopsContact } from './createLoopsContact'
import { evaluateLiveLogJob } from './evaluateLiveLog'
import { notifyClientOfCommitUpdated } from './notifyClientOfCommitUpdated'
import { notifyClientOfDocumentSuggestionCreated } from './notifyClientOfDocumentSuggestionCreated'
import { notifyClientOfDocumentTriggerCreated } from './notifyClientOfDocumentTriggerCreated'
import { notifyClientOfDocumentTriggerDeleted } from './notifyClientOfDocumentTriggerDeleted'
import { notifyClientOfDocumentTriggerEventCreated } from './notifyClientOfDocumentTriggerEventCreated'
import { notifyClientOfEvaluationResultV2Created } from './notifyClientOfEvaluationResultV2Created'
import { notifyClientOfExportReady } from './notifyClientOfExportReady'
import { notifyClientOfMcpServerConnected } from './notifyClientOfMcpServerConnected'
import { notifyClientOfRunStatus } from './notifyClientOfRunStatus'
import { notifyClientOfScaleUpMcpServer } from './notifyClientOfScaleUpMcpServer'
import { notifyToClientDocumentLogCreatedJob } from './notifyToClientDocumentLogCreatedJob'
import { pingProjectUpdateJob } from './pingProjectUpdateJob'
import { requestDocumentSuggestionJobV2 } from './requestDocumentSuggestionJob'
import { sendInvitationToUserJob } from './sendInvitationToUser'
import { sendMagicLinkJob } from './sendMagicLinkHandler'
import { sendReferralInvitationJob } from './sendReferralInvitation'
import { sendSuggestionNotification } from './sendSuggestionNotification'
import { touchApiKeyJob } from './touchApiKeyJob'
import { touchProviderApiKeyJob } from './touchProviderApiKeyJob'
import { undeployDocumentTriggerJob } from './undeployDocumentTriggerJob'
import { updateWebhookLastTriggeredAt } from './webhooks'

export const EventHandlers: IEventsHandlers = {
  claimReferralInvitations: [createClaimInvitationReferralJob],
  commitCreated: [],
  commitPublished: [],
  datasetCreated: [],
  datasetUploaded: [createDatasetRowsJob],
  documentCreated: [],
  documentLogCreated: [notifyToClientDocumentLogCreatedJob],
  experimentVariantsCreated: [],
  documentSuggestionCreated: [
    notifyClientOfDocumentSuggestionCreated,
    sendSuggestionNotification,
  ],
  documentSuggestionApplied: [],
  documentSuggestionDiscarded: [],
  exportReady: [notifyClientOfExportReady],
  magicLinkTokenCreated: [sendMagicLinkJob],
  membershipCreated: [sendInvitationToUserJob],
  projectCreated: [],
  providerApiKeyCreated: [clearProviderApiKeysCache],
  providerApiKeyDestroyed: [clearProviderApiKeysCache],
  providerApiKeyUpdated: [clearProviderApiKeysCache],
  providerLogCreated: [touchApiKeyJob, touchProviderApiKeyJob],
  sendReferralInvitation: [sendReferralInvitationJob],
  userCreated: [createLoopsContact],
  userInvited: [],
  workspaceCreated: [],
  documentRunRequested: [],
  publicDocumentRunRequested: [],
  chatMessageRequested: [],
  sharedChatMessageRequested: [],
  forkDocumentRequested: [],
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
    assignIssueToEvaluationResultV2Job,
  ],
  evaluationResultV2Updated: [],
  scaleMcpServer: [notifyClientOfScaleUpMcpServer],
  mcpServerConnected: [notifyClientOfMcpServerConnected],
  webhookDeliveryCreated: [updateWebhookLastTriggeredAt],
  spanCreated: [evaluateLiveLogJob],
  segmentCreated: [],
  segmentUpdated: [],
  actionExecuted: [],
  toolExecuted: [],
  documentTriggerUndeployRequested: [undeployDocumentTriggerJob],
  documentTriggerCreated: [notifyClientOfDocumentTriggerCreated],
  documentTriggerDeleted: [notifyClientOfDocumentTriggerDeleted],
  documentTriggerEventCreated: [notifyClientOfDocumentTriggerEventCreated],
  promocodeClaimed: [],
  subscriptionUpdated: [],
  commitMerged: [],
  runQueued: [notifyClientOfRunStatus],
  runStarted: [notifyClientOfRunStatus],
  runProgress: [notifyClientOfRunStatus],
  runEnded: [notifyClientOfRunStatus],
  commitUpdated: [notifyClientOfCommitUpdated],
  pasteYourPromptOnboardingPageVisited: [],
  generateDatasetOnboardingPageVisited: [],
  runExperimentOnboardingPageVisited: [],
  pasteYourPromptOnboardingCompleted: [],
  issueCreated: [],
  issueUpdated: [],
  issueDeleted: [],
  issueIncremented: [],
  issueDecremented: [],
  issueDiscovered: [],
  issueMerged: [],
  issueResolved: [],
  issueUnresolved: [],
  issueIgnored: [],
  issueUnignored: [],
}
