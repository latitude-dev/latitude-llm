import { subMonths, subDays } from 'date-fns'
import { SubscriptionPlan } from '../../../plans'

type RunnableType = 'documentLog' | 'evaluationResult'
export type RunnableEntity<T extends RunnableType> = {
  type: T
  createdAt: Date
}

type SubscriptionInfo = { createdAt: Date; plan: SubscriptionPlan }

export const FixtureSubscriptionPlans = {
  [SubscriptionPlan.HobbyV2]: {
    name: 'Hobby',
    credits: 2,
    users: 1,
  },
  [SubscriptionPlan.TeamV1]: {
    name: 'Team',
    credits: 4,
    users: 3,
  },
}

export type WorkspaceInfo = {
  name: string
  logs: RunnableEntity<'documentLog'>[]
  results: RunnableEntity<'evaluationResult'>[]
  subscription: SubscriptionInfo
  memberEmails: string[]
}

export const generateWorkspaceFixtures = (
  currentDate: Date,
): Record<string, WorkspaceInfo> => {
  const subscriptionCreatedAt = subDays(subMonths(currentDate, 6), 14)
  // Leave these logs here. Very handy for debugging dates are correct.

  /* console.log('currentDate', currentDate.toDateString()) */
  /* console.log('subscriptionCreatedAt', subscriptionCreatedAt.toDateString()) */

  // Workspace A
  /* const documentLog0 = subDays(currentDate, 7) */
  /* const documentLog1 = subDays(currentDate, 8) */
  /* const documentLog2 = subDays(currentDate, 37) */
  /* const documentLog3 = subDays(currentDate, 76) */
  /* const documentLog4 = subDays(currentDate, 75) */
  /* const evaluationResult1 = subDays(currentDate, 7) */
  /* const evaluationResult2 = subDays(currentDate, 9) */

  // Workspace B
  /* const documentLog1 = subDays(currentDate, 8) */
  /* const documentLog2 = subDays(currentDate, 25) */
  /* const documentLog3 = subDays(currentDate, 37) */
  /* const evaluationResult1 = subDays(currentDate, 10) */
  /* const evaluationResult2 = subDays(currentDate, 50) */
  /* const evaluationResult3 = subDays(currentDate, 80) */

  /* console.log('documentLog0', documentLog0.toDateString()) */
  /* console.log('documentLog1', documentLog1.toDateString()) */
  /* console.log('documentLog2', documentLog2.toDateString()) */
  /* console.log('documentLog3', documentLog3.toDateString()) */
  /* console.log('documentLog3', documentLog4.toDateString()) */

  /* console.log('evaluationResult1', evaluationResult1.toDateString()) */
  /* console.log('evaluationResult2', evaluationResult2.toDateString()) */
  /* console.log('evaluationResult3', evaluationResult3.toDateString()) */
  return {
    overview__workspaceA: {
      name: 'overview__workspaceA',
      logs: [
        { type: 'documentLog', createdAt: subDays(currentDate, 7) },
        { type: 'documentLog', createdAt: subDays(currentDate, 8) },
        { type: 'documentLog', createdAt: subDays(currentDate, 37) },
        { type: 'documentLog', createdAt: subDays(currentDate, 75) },
        { type: 'documentLog', createdAt: subDays(currentDate, 74) },
      ],
      results: [
        { type: 'evaluationResult', createdAt: subDays(currentDate, 7) },
        { type: 'evaluationResult', createdAt: subDays(currentDate, 9) },
      ],
      subscription: {
        createdAt: subscriptionCreatedAt,
        plan: SubscriptionPlan.TeamV1,
      },
      memberEmails: ['member1@overview__workspaceA.com'],
    },
    overview__workspaceB: {
      name: 'overview__workspaceB',
      logs: [
        { type: 'documentLog', createdAt: subDays(currentDate, 8) },
        { type: 'documentLog', createdAt: subDays(currentDate, 25) },
        { type: 'documentLog', createdAt: subDays(currentDate, 37) },
      ],
      results: [
        { type: 'evaluationResult', createdAt: subDays(currentDate, 10) },
        { type: 'evaluationResult', createdAt: subDays(currentDate, 50) },
        { type: 'evaluationResult', createdAt: subDays(currentDate, 80) },
      ],
      subscription: {
        createdAt: subscriptionCreatedAt,
        plan: SubscriptionPlan.TeamV1,
      },
      memberEmails: [
        'member1@overview__workspaceB.com',
        'member2@overview__workspaceB.com',
        'member3@overview__workspaceB.com',
      ],
    },
  }
}
