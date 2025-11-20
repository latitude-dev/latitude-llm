import { ESCALATION_EXPIRATION_DAYS } from '@latitude-data/constants/issues'
import { env } from '@latitude-data/env'
import { findAllUsersInWorkspace } from '../../data-access/users'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { IssueEscalatingMailer } from '../../mailers'
import { IssuesRepository } from '../../repositories'
import { IssueIncrementedEvent } from '../events'
import { Workspace } from '../../schema/models/types/Workspace'

async function sendEmail({
  workspace,
  issue,
}: {
  workspace: Workspace
  issue: NonNullable<Awaited<ReturnType<IssuesRepository['find']>>['value']>
}) {
  if (!workspace) return
  const users = await findAllUsersInWorkspace(workspace)
  if (users.length === 0) return

  // Build the link to the issue in the dashboard
  // TODO: Fix this URL
  const issueLink = `${env.APP_URL}/projects/${issue.projectId}/versions/HEAD/issues?issueId=${issue.id}`

  await Promise.all(
    users.map(async (user) => {
      const mailer = new IssueEscalatingMailer(
        {
          to: user.email,
        },
        {
          issueTitle: issue.title,
          link: issueLink,
        },
      )

      return mailer.send().then((r) => r.unwrap())
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
}: {
  data: IssueIncrementedEvent
}) {
  const { workspaceId, issueId, previousEscalatingAt } = event.data

  // Fetch workspace and issue (issue now has the updated escalating_at after updateEscalatingIssue)
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const issuesRepo = new IssuesRepository(workspaceId)
  const issueResult = await issuesRepo.find(issueId)
  if (issueResult.error) throw issueResult.error

  const issue = issueResult.value

  // If the issue is not currently escalating, don't send email
  if (!issue.escalatingAt) return

  // Calculate expiration date
  const now = new Date()
  const expirationDate = new Date(
    now.getTime() - ESCALATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  )

  // Check if previous escalating_at was null or expired
  const wasNotEscalating = !previousEscalatingAt
  const wasEscalatingButExpired =
    previousEscalatingAt && previousEscalatingAt <= expirationDate

  // Only send email if this is a NEW escalation (no previous, or previous expired)
  if (wasNotEscalating || wasEscalatingButExpired) {
    await sendEmail({ workspace, issue })
  }

// If previousEscalatingAt exists and is not expired, we're still in the same
// escalation period - don't send another email
}
