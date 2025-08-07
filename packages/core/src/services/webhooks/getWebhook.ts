import { and, eq } from 'drizzle-orm'

import { database } from '../../client'
import { webhooks } from '../../schema/models/webhooks'
import { NotFoundError } from '../../lib/errors'
import { Result, type TypedResult } from '../../lib/Result'
import { type Webhook } from './types'
import { type Workspace } from '../../browser'

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
