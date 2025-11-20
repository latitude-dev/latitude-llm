import { and, eq, asc } from 'drizzle-orm'
import { ESCALATION_EXPIRATION_DAYS } from '@latitude-data/constants/issues'
import { env } from '@latitude-data/env'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import {
  IssueEscalatingMailer,
  SendIssueEscalatingMailOptions,
} from '../../mailers'
import { IssuesRepository, IssueHistogramsRepository } from '../../repositories'
import { updateEscalatingIssue } from '../../services/issues/updateEscalating'
import { captureException } from '../../utils/datadogCapture'
import { IssueIncrementedEvent } from '../events'
import { Workspace } from '../../schema/models/types/Workspace'
import { users } from '../../schema/models/users'
import { database } from '../../client'
import { memberships } from '../../schema/models/memberships'

const BATCH_SIZE = 100 // Batch size can be up to 1000 in mailgun

async function findNotificableMembers(workspace: Workspace) {
  return database
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      membershipId: memberships.id,
    })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.workspaceId, workspace.id),
        eq(memberships.wantToReceiveEscalatingIssuesEmail, true),
      ),
    )
    .orderBy(asc(users.createdAt))
}

// TODO: Refactor common batching logic with other mailers
async function sendEmail({
  workspace,
  issue,
  commitUuid,
  projectId,
  batchSize = BATCH_SIZE,
}: {
  workspace: Workspace
  issue: NonNullable<Awaited<ReturnType<IssuesRepository['find']>>['value']>
  commitUuid: string
  projectId: number
  batchSize?: number
}) {
  if (!workspace) {
    return
  }

  const members = await findNotificableMembers(workspace)

  if (members.length === 0) return

  // Fetch histogram data for the issue
  const histogramsRepo = new IssueHistogramsRepository(workspace.id)
  const histogramResult = await histogramsRepo.findHistogramForIssue({
    issueId: issue.id,
    commitUuid: commitUuid,
    projectId: projectId,
  })

  const issueData = {
    title: issue.title,
    eventsCount: histogramResult.totalCount,
    histogram: histogramResult.data,
  }

  const mailer = new IssueEscalatingMailer(
    {}, // No mailer options, we'll set recipients later
    {
      issueTitle: issue.title,
      link: `${env.APP_URL}/projects/${projectId}/versions/${commitUuid}/issues?issueId=${issue.id}`,
    },
  )

  const addresses = members.map((member) => ({
    id: member.id,
    address: member.email,
    name: member.name || member.email,
    membershipId: member.membershipId,
  }))

  const batches: SendIssueEscalatingMailOptions[] = []

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batchAddresses = addresses.slice(i, i + batchSize)
    const recipientVariables: Record<string, Record<string, unknown>> = {}

    batchAddresses.forEach((user) => {
      recipientVariables[user.address] = {
        name: user.name,
        id: user.id,
        membershipId: user.membershipId,
      }
    })

    batches.push({
      to: batchAddresses.map((u) => u.address),
      recipientVariables,
      currentWorkspace: workspace,
      issue: issueData,
    })
  }

  await Promise.allSettled(
    batches.map(async (batch, index) => {
      const result = await mailer.send(batch)

      if (result.error) {
        const batchSize = Array.isArray(batch.to) ? batch.to.length : 1
        captureException(result.error, {
          issueId: issue.id,
          issueTitle: issue.title,
          workspaceId: workspace.id,
          batchIndex: index,
          batchSize: batchSize,
          context: 'issue_escalation_email',
        })
      }
    }),
  )
}

/**
 * Handler for the issueIncremented event that checks if an issue is starting
 * to escalate and sends an email notification.
 *
 * This handler only sends an email when:
 * 1. The issue is currently escalating (after updateEscalatingIssue was called)
 * 2. The previous escalating_at was null OR expired (> ESCALATION_EXPIRATION_DAYS ago)
 *
 * This ensures we only send one email per escalation period and don't spam
 * users with multiple emails for the same escalation session.
 */
export async function sendIssueEscalatingHandler({
  data: event,
  batchSize,
}: {
  data: IssueIncrementedEvent
  batchSize?: number
}) {
  const { workspaceId, issueId, commitUuid, projectId } = event.data

  // Fetch workspace and issue
  const workspace = await unsafelyFindWorkspace(workspaceId)

  if (!workspace)
    throw new NotFoundError(
      'Workspace not found sending issue escalation email',
    )

  const issuesRepo = new IssuesRepository(workspaceId)
  const issue = await issuesRepo.find(issueId).then((r) => r.unwrap())

  const previousEscalatingAt = issue.escalatingAt
  const updateResult = await updateEscalatingIssue({ issue })
  const updatedIssue = updateResult.unwrap()
  const escalatingAt = updatedIssue.escalatingAt

  // If issue is not escalating after the check, don't send email
  if (!escalatingAt) return

  // Calculate expiration date
  const now = new Date()
  const expirationDate = new Date(
    now.getTime() - ESCALATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  )

  // Check if this is a NEW escalation (wasn't escalating or was expired)
  const wasNotEscalating = !previousEscalatingAt
  const wasEscalatingButExpired =
    previousEscalatingAt && previousEscalatingAt <= expirationDate

  if (!wasNotEscalating && !wasEscalatingButExpired) return

  await sendEmail({
    workspace,
    issue: updatedIssue,
    commitUuid,
    projectId,
    batchSize,
  })
}
