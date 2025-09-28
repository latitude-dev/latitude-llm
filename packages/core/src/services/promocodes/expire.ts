import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { promocodes } from '../../schema/models/promocodes'
import { Promocode } from '../../schema/types'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { eq } from '../../client/utils'
import { findByCode } from '../../data-access/promocodes'

/**
 * Expires a promocode by setting its cancelledAt timestamp
 * @param code - The promocode to expire
 * @param transaction - Optional transaction instance
 * @returns Result containing the expired promocode
 */
export async function expirePromocode(
  { code }: { code: string },
  transaction = new Transaction(),
): PromisedResult<Promocode> {
  return transaction.call<Promocode>(async (tx) => {
    const promocodeResult = await findByCode(code, tx)

    if (!Result.isOk(promocodeResult)) {
      return Result.error(
        new NotFoundError(`Promocode with code "${code}" does not exist`),
      )
    }

    const promocode = promocodeResult.unwrap()

    // Check if already expired
    if (promocode.cancelledAt) {
      return Result.error(new BadRequestError('Promocode is already expired'))
    }

    const [expiredPromocode] = await tx
      .update(promocodes)
      .set({ cancelledAt: new Date() })
      .where(eq(promocodes.code, code))
      .returning()

    if (!expiredPromocode) {
      return Result.error(new BadRequestError('Failed to expire promocode'))
    }

    return Result.ok(expiredPromocode as Promocode)
  })
}
