import { users } from '../../schema/models/users'
import { env } from '@latitude-data/env'
import { subDays } from 'date-fns'
import { eq } from 'drizzle-orm'
import { DOCUMENT_SUGGESTION_NOTIFICATION_DAYS } from '../../constants'
import { type User } from '../../schema/models/types/User'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SuggestionMailer } from '../../mailer/mailers/suggestions/SuggestionMailer'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  UsersRepository,
} from '../../repositories'
import { DocumentSuggestionCreatedEvent } from '../events'

const UTM_SOURCE = 'email'
const UTM_CAMPAIGN = 'document_suggestions'

function hasExceededNotificationLimits(user: User) {
  return (
    user.lastSuggestionNotifiedAt &&
    user.lastSuggestionNotifiedAt >
      subDays(new Date(), DOCUMENT_SUGGESTION_NOTIFICATION_DAYS)
  )
}

// TODO(evalsv2): add tests for evals v2
export const sendSuggestionNotification = async ({
  data: event,
}: {
  data: DocumentSuggestionCreatedEvent
}) => {
  const { workspaceId, suggestion, evaluation } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(suggestion.commitId)
    .then((r) => r.unwrap())

  const documentsRepository = new DocumentVersionsRepository(workspace.id)
  const document = await documentsRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: suggestion.documentUuid,
    })
    .then((r) => r.unwrap())

  let usersRepository = new UsersRepository(workspace.id)
  let user = await usersRepository.find(commit.userId).then((r) => r.unwrap())

  if (hasExceededNotificationLimits(user)) return

  await new Transaction().call(async (tx) => {
    usersRepository = new UsersRepository(workspace.id, tx)
    await usersRepository.lock({ id: commit.userId }).then((r) => r.unwrap())
    user = await usersRepository.find(commit.userId).then((r) => r.unwrap())

    if (hasExceededNotificationLimits(user)) return Result.nil()

    await tx
      .update(users)
      .set({ lastSuggestionNotifiedAt: new Date() })
      .where(eq(users.id, user.id))

    const mailer = new SuggestionMailer(
      { to: user.email },
      {
        user: user.name!,
        document: document.path.split('/').pop()!,
        evaluation: evaluation.name,
        suggestion: suggestion.summary,
        link: `${env.APP_URL}/projects/${commit.projectId}/versions/${commit.uuid}/documents/${document.documentUuid}?utm_source=${UTM_SOURCE}&utm_campaign=${UTM_CAMPAIGN}`,
      },
    )

    await mailer.send().then((r) => r.unwrap())

    return Result.nil()
  })
}
