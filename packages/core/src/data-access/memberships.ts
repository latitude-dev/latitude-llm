import { memberships } from '../schema/models/memberships'
import { eq } from 'drizzle-orm'

import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'

export async function unsafelyFindMembershipByToken(
  token: string,
  db = database,
) {
  const m = await db
    .select()
    .from(memberships)
    .where(eq(memberships.invitationToken, token))
    .limit(1)
    .then((rows) => rows[0])
  if (!m) return Result.error(new NotFoundError('Membership not found'))

  return Result.ok(m)
}

export async function unsafelyFindMembership(id: number) {
  const m = await database
    .select()
    .from(memberships)
    .where(eq(memberships.id, id))
    .limit(1)
    .then((rows) => rows[0])
  if (!m) return Result.error(new NotFoundError('Membership not found'))

  return Result.ok(m)
}
