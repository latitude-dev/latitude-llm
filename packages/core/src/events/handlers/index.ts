import { IEventsHandlers } from '../events'
import { assignIssueToEvaluationResultV2Job } from './assignIssueToEvaluationResultV2Job'
import { clearProviderApiKeysCache } from './clearProviderApiKeysCache'
import { createClaimInvitationReferralJob } from './createClaimInvitationReferralJob'
import { createDatasetRowsJob } from './createDatasetRowsJobs'
import { createLoopsContact } from './createLoopsContact'
import { updateLoopsContact } from './updateLoopsContact'
import { enqueueShadowTestChallengerHandler } from './enqueueShadowTestChallenger'
import { evaluateLiveLogJob } from './evaluateLiveLog'
import { generateDetailsForMergedIssue } from './generateDetailsForMergedIssue'
import { handleEvaluationResultV2Updated } from './handleEvaluationResultV2Updated'
import { notifyClientOfDocumentSuggestionCreated } from './notifyClientOfDocumentSuggestionCreated'
import { notifyClientOfDocumentTriggerCreated } from './notifyClientOfDocumentTriggerCreated'
import { notifyClientOfDocumentTriggerDeleted } from './notifyClientOfDocumentTriggerDeleted'
import { notifyClientOfDocumentTriggerEventCreated } from './notifyClientOfDocumentTriggerEventCreated'
import { notifyClientOfEvaluationResultV2Created } from './notifyClientOfEvaluationResultV2Created'
import { notifyClientOfEvaluationStatus } from './notifyClientOfEvaluationStatus'
import { notifyClientOfEvaluationV2AlignmentUpdated } from './notifyClientOfEvaluationV2AlignmentUpdated'
import { notifyClientOfExportReady } from './notifyClientOfExportReady'
import { notifyClientOfOptimizationStatus } from './notifyClientOfOptimizationStatus'
import { notifyClientOfRunStatusByDocument } from './notifyClientOfRunStatusByDocument'
import { notifyClientOfSpanCreated } from './notifyClientOfSpanCreated'
import { notifyToClientDocumentLogCreatedJob } from './notifyToClientDocumentLogCreatedJob'
import { pingProjectUpdateJob } from './pingProjectUpdateJob'
import { removeMergedIssueVectors } from './removeMergedIssueVectors'
import { requestDocumentSuggestionJobV2 } from './requestDocumentSuggestionJob'
import { sendInvitationToUserJob } from './sendInvitationToUser'
import { sendIssueEscalatingHandler } from './sendIssueEscalatingHandler'
import { sendMagicLinkJob } from './sendMagicLinkHandler'
import { sendReferralInvitationJob } from './sendReferralInvitation'
import { sendSuggestionNotification } from './sendSuggestionNotification'
import { stopDeploymentTestsForCommitHandler } from './stopDeploymentTestsForCommitHandler'
import { touchApiKeyJob } from './touchApiKeyJob'
import { touchProviderApiKeyJob } from './touchProviderApiKeyJob'
import { undeployDocumentTriggerJob } from './undeployDocumentTriggerJob'
import { unlockIssuesDashboardOnAnnotation } from './unlockIssuesDashboardOnAnnotation'
import { updateWebhookLastTriggeredAt } from './webhooks'
import { unassignIssuesOnDocumentsDeleted } from './unassignIssuesOnDocumentsDeleted'

export const EventHandlers: IEventsHandlers = {
  claimReferralInvitations: [createClaimInvitationReferralJob],
  commitCreated: [],
  commitPublished: [],
  datasetCreated: [],
  datasetUploaded: [createDatasetRowsJob],
  documentCreated: [],
  documentsDeleted: [unassignIssuesOnDocumentsDeleted],
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
  userOnboardingInfoUpdated: [updateLoopsContact],
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
  evaluationV2AlignmentUpdated: [notifyClientOfEvaluationV2AlignmentUpdated],
  evaluationV2Deleted: [pingProjectUpdateJob],
  evaluationV2Ran: [],
  evaluationV2Annotated: [unlockIssuesDashboardOnAnnotation],
  evaluationResultV2Created: [
    assignIssueToEvaluationResultV2Job,
    notifyClientOfEvaluationResultV2Created,
    requestDocumentSuggestionJobV2,
  ],
  evaluationResultV2Updated: [handleEvaluationResultV2Updated],
  webhookDeliveryCreated: [updateWebhookLastTriggeredAt],
  spanCreated: [evaluateLiveLogJob, notifyClientOfSpanCreated],
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
  subscriptionEnqueuedForCancellation: [],
  stripeCustomerIdAssigned: [],
  stripeCustomerIdUnassigned: [],
  commitMerged: [stopDeploymentTestsForCommitHandler],
  commitDeleted: [stopDeploymentTestsForCommitHandler],
  documentRunQueued: [notifyClientOfRunStatusByDocument],
  documentRunStarted: [
    notifyClientOfRunStatusByDocument,
    enqueueShadowTestChallengerHandler,
  ],
  documentRunProgress: [notifyClientOfRunStatusByDocument],
  documentRunEnded: [notifyClientOfRunStatusByDocument],
  commitUpdated: [],
  pasteYourPromptOnboardingPageVisited: [],
  generateDatasetOnboardingPageVisited: [],
  runExperimentOnboardingPageVisited: [],
  pasteYourPromptOnboardingCompleted: [],
  issueCreated: [],
  issueUpdated: [],
  issueDeleted: [],
  issueIncremented: [sendIssueEscalatingHandler],
  issueDecremented: [],
  issueDiscovered: [],
  issueMerged: [removeMergedIssueVectors, generateDetailsForMergedIssue],
  issueResolved: [],
  issueUnresolved: [],
  issueIgnored: [],
  issueUnignored: [],
  evaluationQueued: [notifyClientOfEvaluationStatus],
  evaluationStarted: [notifyClientOfEvaluationStatus],
  evaluationProgress: [notifyClientOfEvaluationStatus],
  evaluationEnded: [notifyClientOfEvaluationStatus],
  evaluationFailed: [notifyClientOfEvaluationStatus],
  weeklyEmailPreferenceUpdated: [],
  escalatingIssuesEmailPreferenceUpdated: [],
  workspaceIssuesDashboardUnlocked: [],
  deploymentTestCreated: [],
  weeklyWorkspacesNotifiedTotal: [],
  weeklyWorkspaceNotified: [],
  optimizationStarted: [notifyClientOfOptimizationStatus],
  optimizationPrepared: [notifyClientOfOptimizationStatus],
  optimizationExecuted: [notifyClientOfOptimizationStatus],
  optimizationValidated: [notifyClientOfOptimizationStatus],
  optimizationEnded: [notifyClientOfOptimizationStatus],
}
