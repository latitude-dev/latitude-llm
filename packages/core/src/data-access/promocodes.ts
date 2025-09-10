import { desc, eq } from 'drizzle-orm'

import { database } from '../client'
import { Result } from '../lib/Result'
import { claimedPromocodes, promocodes } from '../schema'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Promocode } from '../browser'

export async function findAllPromocodes(tx = database) {
  const result = await tx
    .select()
    .from(promocodes)
    .orderBy(desc(promocodes.createdAt), desc(promocodes.id))

  return Result.ok(result)
}

export async function findUsedPromocodesByCode(code: string, tx = database) {
  const result = await tx
    .select()
    .from(claimedPromocodes)
    .where(eq(claimedPromocodes.code, code))

  return Result.ok(result)
}

export async function findByCode(code: string, tx = database) {
  const [result] = await tx
    .select()
    .from(promocodes)
    .where(eq(promocodes.code, code))
    .limit(1)

  if (!result) {
    return Result.error(new NotFoundError(`Promocode does not exist`))
  }

  return Result.ok(result as Promocode)
}
