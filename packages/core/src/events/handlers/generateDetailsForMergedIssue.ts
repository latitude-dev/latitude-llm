import {
  ISSUE_JOBS_GENERATE_DETAILS_THROTTLE,
  ISSUE_JOBS_MAX_ATTEMPTS,
} from '../../constants'
import { generateIssueDetailsJobKey } from '../../jobs/job-definitions/issues/generateIssueDetailsJob'
import { queues } from '../../jobs/queues'
import { EventHandler, IssueMergedEvent } from '../events'

/**
 * Queues a job to generate details for the winning issue after a merge.
 * This event handler reacts to issue merges by scheduling work to regenerate
 * the combined details for the merged issue.
 */
export const generateDetailsForMergedIssue: EventHandler<
  IssueMergedEvent
> = async ({ data: event }: { data: IssueMergedEvent }): Promise<void> => {
  const { workspaceId, anchorId } = event.data

  const payload = { workspaceId, issueId: anchorId }
  const { issuesQueue } = await queues()

  await issuesQueue.add('generateIssueDetailsJob', payload, {
    attempts: ISSUE_JOBS_MAX_ATTEMPTS,
    deduplication: {
      id: generateIssueDetailsJobKey(payload),
      ttl: ISSUE_JOBS_GENERATE_DETAILS_THROTTLE,
    },
  })
}
