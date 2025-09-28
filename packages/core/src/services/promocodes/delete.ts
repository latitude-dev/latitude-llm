import { promocodes } from '../../schema/models/promocodes'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { eq } from 'drizzle-orm'
import { findClaimedByCode } from '../../data-access/promocodes'

export async function deletePromocode(
  { code }: { code: string },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const isPromocodeUsedResult = await isPromocodeUsed(code)
    if (!Result.isOk(isPromocodeUsedResult)) return isPromocodeUsedResult
    const promocodeUsed = isPromocodeUsedResult.unwrap()

    if (promocodeUsed) {
      return Result.error(new Error('Promocode is used, cannot delete it'))
    }

    const [promocode] = await tx
      .delete(promocodes)
      .where(eq(promocodes.code, code))
      .returning()

    if (!promocode) {
      return Result.error(new Error('Promocode failed during deletion'))
    }

    return Result.ok(promocode)
  })
}

async function isPromocodeUsed(code: string): PromisedResult<boolean> {
  const claimedPromocodesResult = await findClaimedByCode(code)
  if (!Result.isOk(claimedPromocodesResult)) {
    return claimedPromocodesResult
  }
  const claimedPromocodes = claimedPromocodesResult.unwrap()
  return Result.ok(claimedPromocodes.length > 0)
}
