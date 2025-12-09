export type AddressItem = {
  email: string
  name?: string | null
  userId?: string | number
  membershipId?: string | number
}

type BatchRecipient = {
  to: string[]
  recipientVariables: Record<string, AddressItem>
}

export function buildBatchRecipients({
  addressList,
  batchSize,
}: {
  addressList: AddressItem[]
  batchSize: number
}) {
  const batches: BatchRecipient[] = []
  for (let i = 0; i < addressList.length; i += batchSize) {
    const batchAddresses = addressList.slice(i, i + batchSize)
    const recipientVariables: Record<string, AddressItem> = {}

    batchAddresses.forEach((batch) => {
      const email = batch.email
      recipientVariables[email] = { ...batch, name: batch.name ?? email }
    })

    batches.push({
      to: batchAddresses.map((b) => b.email),
      recipientVariables,
    })
  }

  return batches
}

export type RecipientBatch = ReturnType<typeof buildBatchRecipients>[number]
