import { and, eq, gte } from 'drizzle-orm'

import { database } from '../../client'
import { Result, TypedResult } from '../../lib/Result'
import { Invitation, invitations } from '../../schema/models/invitations'

interface ValidateInvitationArgs {
  token: string
}

export async function validateInvitation(
  { token }: ValidateInvitationArgs,
  db = database,
): Promise<TypedResult<Invitation, Error>> {
  try {
    const invitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, token),
        eq(invitations.status, 'pending'),
        gte(invitations.expiresAt, new Date()), // Check if not expired
      ),
    })

    if (!invitation) {
      return Result.error(new Error('Invitation token is invalid, not found, or has expired.'))
    }

    return Result.ok(invitation)
  } catch (e) {
    const error = e instanceof Error ? e : new Error('An unexpected error occurred')
    console.error('Error validating invitation:', error)
    return Result.error(error)
  }
}
