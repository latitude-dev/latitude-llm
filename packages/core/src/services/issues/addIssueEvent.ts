import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { upsertHistogram } from '../issueHistograms/upsert'

// TODO: Validate the result is not passed and not errored before assigning issue
// TODO: Check issue belongs to document
// TODO: upsert histogram add or remove a count

/**
 * This service takes care of validating the issue.documentUuid is the same as
 * the document version provided in the argument.
 *
 * Also creates or destroy an event (issue histogram) for the issue.
 */
export async function addIssueEvent(
  {
    commit,
    document,
    issue,
  }: {
    commit: Commit
    document: DocumentVersion
    issue: Issue
  },
  transaction = new Transaction(),
) {
  const documentUuid = document.documentUuid

  if (document.documentUuid !== issue.documentUuid) {
    return Result.error(
      new Error(
        `Issue document UUID (${issue.documentUuid}) does not match the provided document version UUID (${documentUuid})`,
      ),
    )
  }

  const upsertResult = await upsertHistogram({ commit, issue, date: new Date() }, transaction)
  if (upsertResult.error) return upsertResult

  return Result.ok({ issue })
}
