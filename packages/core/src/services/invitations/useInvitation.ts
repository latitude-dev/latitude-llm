import { eq, and } from 'drizzle-orm'

import { database } from '../../client'
import { Result, TypedResult } from '../../lib/Result'
import { Invitation, invitations } from '../../schema/models/invitations'

interface UseInvitationArgs {
  token: string
  // userId?: string; // Optional: if we want to record which user accepted it
}

export async function useInvitation(
  { token /*, userId */ }: UseInvitationArgs,
  db = database,
): Promise<TypedResult<Invitation, Error>> {
  try {
    const existingInvitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, token),
        eq(invitations.status, 'pending'), // Can only use 'pending' invitations
      ),
    })

    if (!existingInvitation) {
      return Result.error(new Error('Invitation not found or already used/expired.'))
    }

    // Check for expiration again, just in case, though validateInvitation should handle this first
    if (new Date(existingInvitation.expiresAt) < new Date()) {
      return Result.error(new Error('Invitation has expired.'))
    }

    const updated = await db
      .update(invitations)
      .set({
        status: 'accepted',
        updatedAt: new Date(),
      })
      .where(eq(invitations.id, existingInvitation.id))
      .returning()

    if (updated.length === 0) {
      return Result.error(new Error('Failed to update invitation status.'))
    }

    return Result.ok(updated[0]!) // Add non-null assertion
  } catch (e) {
    const error = e instanceof Error ? e : new Error('An unexpected error occurred')
    console.error('Error using invitation:', error)
    return Result.error(error)
  }
}
