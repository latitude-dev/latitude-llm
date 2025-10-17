import { faker } from '@faker-js/faker'

import { QuotaType } from '@latitude-data/constants'
import { createPromocode as createFn } from '../../services/promocodes/create'
import { expirePromocode } from '../../services/promocodes/expire'

export function defaultPromocodeFakeData() {
  return {
    code: faker.string.alphanumeric(8).toUpperCase(),
    quotaType: QuotaType.Credits,
    description: faker.lorem.sentence(),
    amount: faker.number.int({ min: 10, max: 1000 }),
  }
}

export type ICreatePromocode = {
  code?: string
  quotaType?: QuotaType
  description?: string
  amount?: number
  cancelledAt?: Date
}

export async function createPromocode({
  code,
  quotaType,
  description,
  amount,
  cancelledAt,
}: ICreatePromocode = {}) {
  const fakeData = defaultPromocodeFakeData()

  let promocode = await createFn({
    code: code ?? fakeData.code,
    quotaType: quotaType ?? fakeData.quotaType,
    description: description ?? fakeData.description,
    amount: amount ?? fakeData.amount,
  }).then((r) => r.unwrap())

  if (cancelledAt) {
    promocode = await expirePromocode({ code: promocode.code }).then((r) =>
      r.unwrap(),
    )
  }

  return promocode
}

export async function createExpiredPromocode(
  overrides: Partial<ICreatePromocode> = {},
) {
  return createPromocode({
    ...overrides,
    cancelledAt: new Date(),
  })
}

export async function createCreditsPromocode(
  amount: number,
  overrides: Partial<ICreatePromocode> = {},
) {
  return createPromocode({
    ...overrides,
    quotaType: QuotaType.Credits,
    amount,
  })
}

export async function createRunsPromocode(
  amount: number,
  overrides: Partial<ICreatePromocode> = {},
) {
  return createPromocode({
    ...overrides,
    quotaType: QuotaType.Runs,
    amount,
  })
}

export async function createSeatsPromocode(
  amount: number,
  overrides: Partial<ICreatePromocode> = {},
) {
  return createPromocode({
    ...overrides,
    quotaType: QuotaType.Seats,
    amount,
  })
}
