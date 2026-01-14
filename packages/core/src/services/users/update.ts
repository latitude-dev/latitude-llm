import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
import { publisher } from '../../events/publisher'

const FINAL_ONBOARDING_FIELDS: (keyof User)[] = [
  'latitudeGoal',
  'latitudeGoalOther',
]

export function isFinalOnboardingStep(values: Partial<User>): boolean {
  return FINAL_ONBOARDING_FIELDS.some((field) => field in values)
}

export const updateUser = async (
  user: User,
  values: Partial<User>,
  transaction = new Transaction(),
) => {
  return transaction.call<User>(
    async (tx) => {
      const updates = await tx
        .update(users)
        .set(values)
        .where(eq(users.id, user.id))
        .returning()

      return Result.ok(updates[0]!)
    },
    (updatedUser) => {
      if (isFinalOnboardingStep(values)) {
        publisher.publishLater({
          type: 'userOnboardingInfoUpdated',
          data: {
            ...updatedUser,
            userEmail: updatedUser.email,
          },
        })
      }
    },
  )
}
