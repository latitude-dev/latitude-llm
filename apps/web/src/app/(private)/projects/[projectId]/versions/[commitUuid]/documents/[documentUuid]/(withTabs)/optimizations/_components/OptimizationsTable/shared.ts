import { OPTIMIZATION_CANCELLED_ERROR } from '@latitude-data/constants'
import { Optimization } from '@latitude-data/core/schema/models/types/Optimization'

export type OptimizationStatus =
  | 'preparing'
  | 'optimizing'
  | 'validating'
  | 'finishing'
  | 'completed'
  | 'failed'

export type OptimizationPhase = {
  status: OptimizationStatus
  label: string
  isActive: boolean
  isCompleted: boolean
  hasError: boolean
}

export function getOptimizationPhase(
  optimization: Optimization,
): OptimizationPhase {
  if (optimization.error) {
    return {
      status: 'failed',
      label:
        optimization.error === OPTIMIZATION_CANCELLED_ERROR
          ? 'Cancelled by user'
          : 'Unexpected error',
      isActive: false,
      isCompleted: true,
      hasError: true,
    }
  }

  if (optimization.finishedAt) {
    return {
      status: 'completed',
      label: 'Completed',
      isActive: false,
      isCompleted: true,
      hasError: false,
    }
  }

  if (optimization.validatedAt) {
    return {
      status: 'finishing',
      label: 'Wrapping up...',
      isActive: true,
      isCompleted: false,
      hasError: false,
    }
  }

  if (optimization.executedAt) {
    return {
      status: 'validating',
      label: 'Validating results...',
      isActive: true,
      isCompleted: false,
      hasError: false,
    }
  }

  if (optimization.preparedAt) {
    return {
      status: 'optimizing',
      label: 'Optimizing prompt...',
      isActive: true,
      isCompleted: false,
      hasError: false,
    }
  }

  return {
    status: 'preparing',
    label: 'Preparing datasets...',
    isActive: true,
    isCompleted: false,
    hasError: false,
  }
}
