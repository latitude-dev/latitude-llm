import { subDays, subMonths } from 'date-fns'
import { SubscriptionPlan } from '../../../plans'

type RunnableType = 'span' | 'evaluationResult' | 'evaluationResultV2'
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
  spans: RunnableEntity<'span'>[]
  results: RunnableEntity<'evaluationResult'>[]
  resultsV2: RunnableEntity<'evaluationResultV2'>[]
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
  /* const span0 = subDays(currentDate, 7) */
  /* const span1 = subDays(currentDate, 8) */
  /* const span2 = subDays(currentDate, 37) */
  /* const span3 = subDays(currentDate, 76) */
  /* const span4 = subDays(currentDate, 75) */
  /* const evaluationResult1 = subDays(currentDate, 7) */
  /* const evaluationResult2 = subDays(currentDate, 9) */

  // Workspace B
  /* const span1 = subDays(currentDate, 8) */
  /* const span2 = subDays(currentDate, 25) */
  /* const span3 = subDays(currentDate, 37) */
  /* const evaluationResult1 = subDays(currentDate, 10) */
  /* const evaluationResult2 = subDays(currentDate, 50) */
  /* const evaluationResult3 = subDays(currentDate, 80) */

  /* console.log('span0', span0.toDateString()) */
  /* console.log('span1', span1.toDateString()) */
  /* console.log('span2', span2.toDateString()) */
  /* console.log('span3', span3.toDateString()) */
  /* console.log('span3', span4.toDateString()) */

  /* console.log('evaluationResult1', evaluationResult1.toDateString()) */
  /* console.log('evaluationResult2', evaluationResult2.toDateString()) */
  /* console.log('evaluationResult3', evaluationResult3.toDateString()) */
  return {
    overview__workspaceA: {
      name: 'overview__workspaceA',
      spans: [
        { type: 'span', createdAt: subDays(currentDate, 7) },
        { type: 'span', createdAt: subDays(currentDate, 8) },
        { type: 'span', createdAt: subDays(currentDate, 37) },
        { type: 'span', createdAt: subDays(currentDate, 75) },
        { type: 'span', createdAt: subDays(currentDate, 74) },
      ],
      results: [
        { type: 'evaluationResult', createdAt: subDays(currentDate, 7) },
        { type: 'evaluationResult', createdAt: subDays(currentDate, 9) },
      ],
      resultsV2: [
        { type: 'evaluationResultV2', createdAt: subDays(currentDate, 7) },
        { type: 'evaluationResultV2', createdAt: subDays(currentDate, 9) },
      ],
      subscription: {
        createdAt: subscriptionCreatedAt,
        plan: SubscriptionPlan.TeamV1,
      },
      memberEmails: ['member1@overview__workspaceA.com'],
    },
    overview__workspaceB: {
      name: 'overview__workspaceB',
      spans: [
        { type: 'span', createdAt: subDays(currentDate, 8) },
        { type: 'span', createdAt: subDays(currentDate, 25) },
        { type: 'span', createdAt: subDays(currentDate, 37) },
      ],
      results: [
        { type: 'evaluationResult', createdAt: subDays(currentDate, 10) },
        { type: 'evaluationResult', createdAt: subDays(currentDate, 50) },
        { type: 'evaluationResult', createdAt: subDays(currentDate, 80) },
      ],
      resultsV2: [
        { type: 'evaluationResultV2', createdAt: subDays(currentDate, 10) },
        { type: 'evaluationResultV2', createdAt: subDays(currentDate, 50) },
        { type: 'evaluationResultV2', createdAt: subDays(currentDate, 80) },
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
