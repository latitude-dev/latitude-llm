import { Job } from 'bullmq'
import { and, asc, eq } from 'drizzle-orm'
import { database } from '../../../client'
import { getLogsData } from '../../../data-access/weeklyEmail/logs'
import { getIssuesData } from '../../../data-access/weeklyEmail/issues'
import { getAnnotationsData } from '../../../data-access/weeklyEmail/annotations'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { WeeklyEmailMailer } from '../../../mailer/mailers/weeklyEmail/WeeklyEmailMailer'
import { memberships } from '../../../schema/models/memberships'
import { users } from '../../../schema/models/users'
import { Workspace } from '../../../schema/models/types/Workspace'

export type SendWeeklyEmailJobData = {
  workspaceId: number
  emails?: string[]
}

const BATCH_SIZE = 100 // Batch size can be up to 1000 in mailgun

async function findNotificableMembers(workspace: Workspace) {
  return database
    .select({
      email: users.email,
      name: users.name,
      userId: users.id,
      membershipId: memberships.id,
    })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.workspaceId, workspace.id),
        eq(memberships.wantToReceiveWeeklyEmail, true),
      ),
    )
    .orderBy(asc(users.createdAt))
}

async function getAddressListMembers({
  workspace,
  emails,
}: {
  workspace: Workspace
  emails?: string[]
}) {
  if (emails && emails.length > 0) {
    return emails.map((email) => ({
      email,
      name: email,
    }))
  }

  return findNotificableMembers(workspace)
}

/**
 * Job that sends weekly email report to workspace members.
 *
 * This job:
 * 1. Fetches workspace data (logs, issues, annotations)
 * 2. Finds members who want to receive weekly emails
 * 3. Sends emails in batches using the WeeklyEmailMailer
 */
export async function sendWeeklyEmailJob(job: Job<SendWeeklyEmailJobData>) {
  const { workspaceId, emails } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId)

  if (!workspace) {
    throw new NotFoundError('Workspace not found sending weekly email')
  }

  const members = await getAddressListMembers({ workspace, emails })

  if (members.length === 0) return

  const [logs, issues, annotations] = await Promise.all([
    getLogsData({ workspace }),
    getIssuesData({ workspace }),
    getAnnotationsData({ workspace }),
  ])

  const mailer = new WeeklyEmailMailer()
  await mailer.sendInBatches({
    addressList: members,
    sendOptions: async (batch) =>
      mailer.send({
        to: batch.to,
        recipientVariables: batch.recipientVariables,
        currentWorkspace: workspace,
        logs,
        issues,
        annotations,
      }),
    context: {
      mailName: 'weekly_email',
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    },
    batchSize: BATCH_SIZE,
  })
}
