import { and, eq } from 'drizzle-orm'

import { type Workspace } from '../../browser'
import { database } from '../../client'
import { NotFoundError } from '../../lib/errors'
import { Result, type TypedResult } from '../../lib/Result'
import { webhooks } from '../../schema/models/webhooks'
import { type Webhook } from './types'

export async function getWebhook(
  id: number,
  workspace: Workspace,
  db = database,
): Promise<TypedResult<Webhook, NotFoundError>> {
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspace.id)))

  if (!webhook) {
    return Result.error(new NotFoundError('Webhook not found'))
  }

  return Result.ok(webhook)
}
