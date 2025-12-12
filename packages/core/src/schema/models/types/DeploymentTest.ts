import { deploymentTests } from '../deploymentTests'

export type DeploymentTest = typeof deploymentTests.$inferSelect
export type DeploymentTestInsert = typeof deploymentTests.$inferInsert
export type DeploymentTestStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
export type DeploymentTestType = 'shadow' | 'ab'
export type RoutedTo = 'baseline' | 'challenger'
export const ACTIVE_DEPLOYMENT_STATUSES = ['pending', 'running', 'paused']
