import { users } from '../../schema' // Import users table
import { unsafelyGetUserByEmail } from '../../data-access/users'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { InvitationMailer } from '../../mailers'
import { UserInvitationCreatedEvent } from '../events.d'
import { type TypedResult } from '../../lib/Result' // Use TypedResult

type CoreUser = typeof users.$inferSelect; // Infer CoreUser type

export async function sendWorkspaceInvitationEmailJob({
  data: event,
}: {
  data: UserInvitationCreatedEvent
}) {
  const inviteeUser = await unsafelyGetUserByEmail(event.data.invitedByUserEmail)
  if (!inviteeUser) {
    throw new NotFoundError(
      `Inviting user not found: ${event.data.invitedByUserEmail}`,
    )
  }

  // Fetch workspace for context, though not directly used by current mailer/template version
  const workspace = await unsafelyFindWorkspace(event.data.workspaceId)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${event.data.workspaceId}`)
  }

  // Construct a User-like object for the person being invited.
  // InvitationMailer expects a User object, and the template uses invited.name.
  // crypto.randomUUID() is a standard Node.js global.
  const invitedUserForMail: CoreUser = {
    id: crypto.randomUUID(),
    name: event.data.invitation.name || event.data.invitation.email.split('@')[0],
    email: event.data.invitation.email,
    confirmedAt: null,
    admin: false,
    lastSuggestionNotifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Ensure all non-nullable fields from the User schema are present
    // avatarUrl, deletedAt etc. are not in the base users schema
  }

  const mailer = new InvitationMailer(
    {
      to: event.data.invitation.email,
      // `from` is typically handled by global mailer configuration
    },
    {
      invited: invitedUserForMail,
      invitee: inviteeUser,
      invitationToken: event.data.invitation.token,
    },
  )

  // The .send() method should handle and return Result type, unwrap will throw on error.
  await mailer.send().then((r: TypedResult<unknown, Error>) => r.unwrap())
}
