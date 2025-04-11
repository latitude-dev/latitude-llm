import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { webhooks } from '../../schema/models/webhooks'
import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { Result, type TypedResult } from '../../lib/Result'
import { type UpdateWebhookParams, type Webhook } from './types'
import Transaction from './../../lib/Transaction'

export async function updateWebhook(
  params: UpdateWebhookParams,
  db = database,
): Promise<TypedResult<Webhook, NotFoundError | UnprocessableEntityError>> {
  const { webhook, name, url, projectIds, isActive } = params

  // Validate URL if provided
  if (url) {
    try {
      new URL(url)
    } catch {
      return Result.error(new UnprocessableEntityError('Invalid webhook URL'))
    }
  }

  const result = await Transaction.call(async (trx) => {
    const [updatedWebhook] = await trx
      .update(webhooks)
      .set({
        name,
        url,
        projectIds,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, webhook.id))
      .returning()

    if (!updatedWebhook) {
      return Result.error(new NotFoundError('Webhook not found'))
    }

    return Result.ok(updatedWebhook)
  }, db)

  if (!Result.isOk(result)) {
    const error = result.error
    if (
      error instanceof NotFoundError ||
      error instanceof UnprocessableEntityError
    ) {
      return Result.error(error)
    }
    return Result.error(
      new UnprocessableEntityError('Failed to update webhook'),
    )
  }

  return result
}
