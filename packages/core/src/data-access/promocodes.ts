import { claimedPromocodes } from '../schema/models/claimedPromocodes'
import { promocodes } from '../schema/models/promocodes'
import { desc, eq } from 'drizzle-orm'

import { database } from '../client'
import { Result } from '../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'
import { type Promocode } from '../schema/models/types/Promocode'

export async function findAll(tx = database) {
  const result = await tx
    .select()
    .from(promocodes)
    .orderBy(desc(promocodes.createdAt), desc(promocodes.id))

  return Result.ok(result)
}

export async function findClaimedByCode(code: string, tx = database) {
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
