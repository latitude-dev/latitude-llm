import { ESCALATION_EXPIRATION_DAYS } from '@latitude-data/constants/issues'
import { env } from '@latitude-data/env'
import { findAllUsersInWorkspace } from '../../data-access/users'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { IssueEscalatingMailer } from '../../mailers'
import { IssuesRepository } from '../../repositories'
import { updateEscalatingIssue } from '../../services/issues/updateEscalating'
import { captureException } from '../../utils/datadogCapture'
import { IssueIncrementedEvent } from '../events'
import { Workspace } from '../../schema/models/types/Workspace'

const BATCH_SIZE = 100

async function sendEmail({
  workspace,
  issue,
  batchSize = BATCH_SIZE,
}: {
  workspace: Workspace
  issue: NonNullable<Awaited<ReturnType<IssuesRepository['find']>>['value']>
  batchSize?: number
}) {
  if (!workspace) return

  const users = await findAllUsersInWorkspace(workspace)

  if (users.length === 0) return

  const mailer = new IssueEscalatingMailer(
    {}, // No mailer options, we'll set recipients later
    {
      issueTitle: issue.title,
      link: `${env.APP_URL}/projects/${issue.projectId}/versions/live/issues?issueId=${issue.id}`,
    },
  )

  const addresses = users.map((u) => ({
    address: u.email,
    name: u.name || u.email,
  }))

  const batches: (typeof addresses)[] = []

  for (let i = 0; i < addresses.length; i += batchSize) {
    batches.push(addresses.slice(i, i + batchSize))
  }

  // Send all batches in parallel and capture any errors
  await Promise.all(
    batches.map(async (batch, index) => {
      const result = await mailer.send({ to: batch })

      if (result.error) {
        captureException(result.error, {
          issueId: issue.id,
          issueTitle: issue.title,
          workspaceId: workspace.id,
          batchIndex: index,
          batchSize: batch.length,
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
  const { workspaceId, issueId } = event.data

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

  // Early return if still in same escalation period
  if (!wasNotEscalating && !wasEscalatingButExpired) return

  // Send email for new escalation
  await sendEmail({ workspace, issue: updatedIssue, batchSize })
}
