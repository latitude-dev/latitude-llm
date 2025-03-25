import { and, eq } from 'drizzle-orm'

import { database } from '../../client'
import { webhooks } from '../../schema/models/webhooks'
import { NotFoundError } from '../../lib/errors'
import { Result, type TypedResult } from '../../lib/Result'
import { type Webhook } from './types'

export async function deleteWebhook(
  {
    webhook,
  }: {
    webhook: Webhook
  },
  db = database,
): Promise<TypedResult<Webhook, NotFoundError>> {
  const [deletedWebhook] = await db
    .delete(webhooks)
    .where(
      and(
        eq(webhooks.id, webhook.id),
        eq(webhooks.workspaceId, webhook.workspaceId),
      ),
    )
    .returning()

  if (!deletedWebhook) {
    return Result.error(new NotFoundError('Webhook not found'))
  }

  return Result.ok(deletedWebhook)
}
