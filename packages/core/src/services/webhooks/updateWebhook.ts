import { eq } from 'drizzle-orm'

import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { Result, type TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { webhooks } from '../../schema/models/webhooks'
import { type UpdateWebhookParams, type Webhook } from './types'

export async function updateWebhook(
  params: UpdateWebhookParams,
  transaction = new Transaction(),
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

  const result = await transaction.call(async (trx) => {
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
  })

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
