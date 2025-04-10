import { eq } from 'drizzle-orm'

import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { memberships } from '../schema'

export async function unsafelyFindMembershipByToken(
  token: string,
  db = database,
) {
  const m = await db.query.memberships.findFirst({
    where: eq(memberships.invitationToken, token),
  })
  if (!m) return Result.error(new NotFoundError('Membership not found'))

  return Result.ok(m)
}

export async function unsafelyFindMembership(id: number) {
  const m = await database.query.memberships.findFirst({
    where: eq(memberships.id, id),
  })
  if (!m) return Result.error(new NotFoundError('Membership not found'))

  return Result.ok(m)
}
