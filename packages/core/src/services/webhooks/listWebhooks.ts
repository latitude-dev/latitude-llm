import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { webhooks } from '../../schema/models/webhooks'
import { type Webhook } from './types'

export async function listWebhooks(
  workspaceId: number,
  db = database,
): Promise<Webhook[]> {
  return db.select().from(webhooks).where(eq(webhooks.workspaceId, workspaceId))
}
