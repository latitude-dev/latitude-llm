export enum QuotaType {
  Seats = 'seats',
  Runs = 'runs',
  Credits = 'credits',
}

export type Quota = number | 'unlimited'

export enum GrantSource {
  System = 'system',
  Subscription = 'subscription',
  Purchase = 'purchase',
  Reward = 'reward',
  Promocode = 'promocode',
}

export type Grant = {
  id: number
  uuid: string // Idempotency key
  workspaceId: number
  referenceId: string
  source: GrantSource
  type: QuotaType
  amount: Quota
  balance: number
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}
