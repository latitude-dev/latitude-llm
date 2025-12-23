'use server'

import { OptimizationsRepository } from '@latitude-data/core/repositories'
import { OptimizationWithDetails } from '@latitude-data/core/schema/types'
import { cancelOptimization } from '@latitude-data/core/services/optimizations/cancel'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

export const cancelOptimizationAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      optimizationId: z.number(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const repository = new OptimizationsRepository(ctx.workspace.id)
    let optimization = await repository
      .find(parsedInput.optimizationId)
      .then((r) => r.unwrap())

    const result = await cancelOptimization({
      optimization: optimization,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    optimization = await repository
      .findWithDetails(result.optimization.id)
      .then((r) => r.unwrap())

    return { optimization: optimization as OptimizationWithDetails }
  })
