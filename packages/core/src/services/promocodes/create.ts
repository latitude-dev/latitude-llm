import { promocodes } from '../../schema/models/promocodes'
import { type Promocode } from '../../schema/models/types/Promocode'
import { QuotaType } from '../../constants'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { Result } from '../../lib/Result'

export async function createPromocode(
  {
    code,
    quotaType,
    description,
    amount,
  }: {
    code: string
    quotaType: QuotaType
    description: string
    amount: number
  },
  transaction = new Transaction(),
): PromisedResult<Promocode> {
  return transaction.call<Promocode>(async (tx) => {
    const validationResult = validatePromocode({
      amount,
    })

    if (!Result.isOk(validationResult)) {
      return validationResult
    }

    const [promocode] = await tx
      .insert(promocodes)
      .values({ code, quotaType, description, amount })
      .returning()

    if (!promocode) {
      return Result.error(new Error('Failed to create promocode'))
    }

    return Result.ok(promocode)
  })
}

// To add more validation, add it here
function validatePromocode({ amount }: { amount: number }) {
  if (amount < 1) {
    return Result.error(new Error('Promocode amount must be greater than 0'))
  }

  return Result.ok(true)
}
