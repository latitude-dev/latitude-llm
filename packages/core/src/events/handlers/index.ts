import { IEventsHandlers } from '../events'
import { createClaimInvitationReferralJob } from './createClaimInvitationReferralJob'
import { createLoopsContact } from './createLoopsContact'
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
  documentRun: [],
  evaluationCreated: [],
  evaluationResultCreated: [notifyToClientEvaluationResultCreatedJob],
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
  chatMessageRequested: [],
  batchEvaluationRunRequested: [],
  runDocumentInBatchRequested: [],
}
