import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { features } from '../../schema'

export type CreateFeatureProps = {
  name: string
  description?: string
}

export async function createFeature(
  { name, description }: CreateFeatureProps,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const [feature] = await tx
      .insert(features)
      .values({
        name,
        description,
      })
      .returning()

    if (!feature) {
      throw new Error('Failed to create feature')
    }

    return Result.ok(feature)
  })
}
