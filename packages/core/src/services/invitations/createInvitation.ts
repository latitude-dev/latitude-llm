import { and, eq, gte } from 'drizzle-orm'
import { add } from 'date-fns'

import { database } from '../../client'
import { Result, TypedResult } from '../../lib/Result'
import { invitations, Invitation, NewInvitation } from '../../schema/models/invitations'

interface CreateInvitationArgs {
  email: string
  invitedByUserId: string
  workspaceId: number // Changed to number
}

export async function createInvitation(
  { email, invitedByUserId, workspaceId }: CreateInvitationArgs,
  db = database,
): Promise<TypedResult<Invitation, Error>> {
  try {
    // Check if an active invitation already exists for this email in this workspace
    const existingInvitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.email, email),
        eq(invitations.workspaceId, workspaceId), // workspaceId is now number, direct comparison with integer schema field is fine
        eq(invitations.status, 'pending'),
        gte(invitations.expiresAt, new Date()),
      ),
    })

    if (existingInvitation) {
      return Result.error(
        new Error('An active invitation for this email already exists in this workspace.'),
      )
    }

    const token = crypto.randomUUID()
    const expiresAt = add(new Date(), { days: 7 }) // Invitation valid for 7 days

    const newInvitationData: NewInvitation = {
      email,
      token,
      expiresAt,
      invitedByUserId,
      workspaceId,
      status: 'pending',
    }

    const result = await db.insert(invitations).values(newInvitationData).returning()

    if (result.length === 0) {
      return Result.error(new Error('Failed to create invitation record.'))
    }

    const createdInvitation = result[0] as Invitation;

    return Result.ok(createdInvitation)
  } catch (e) {
    const error = e instanceof Error ? e : new Error('An unexpected error occurred')
    console.error('Error creating invitation:', error)
    return Result.error(error)
  }
}
