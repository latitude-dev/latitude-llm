import { database } from '../client'
import { subscriptions } from '../schema/models/subscriptions'
import { eq } from 'drizzle-orm'

export async function unsafelyFindSubscriptionByWorkspaceId(
  workspaceId: number,
  db = database,
) {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1)
    .then((rows) => rows[0])
}
