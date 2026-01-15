import { database } from '../../client'
import {
  EvaluationV2,
  OptimizationConfiguration,
  OptimizationEngine,
} from '../../constants'
import { optimizations } from '../../schema/models/optimizations'
import { Commit } from '../../schema/models/types/Commit'
import { Dataset } from '../../schema/models/types/Dataset'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Experiment } from '../../schema/models/types/Experiment'
import { Optimization } from '../../schema/models/types/Optimization'
import { Project } from '../../schema/models/types/Project'
import { Workspace } from '../../schema/models/types/Workspace'
import { createEvaluationV2 } from './evaluationsV2'

export async function createOptimization({
  baseline,
  optimized,
  evaluation,
  engine,
  configuration,
  trainset,
  testset,
  error,
  document,
  project,
  workspace,
}: {
  baseline: {
    commit: Commit
    prompt?: string
    experiment?: Experiment
  }
  optimized?: {
    commit?: Commit
    prompt?: string
    experiment?: Experiment
  }
  evaluation?: EvaluationV2
  engine?: OptimizationEngine
  configuration?: OptimizationConfiguration
  trainset?: Dataset
  testset?: Dataset
  error?: string
  document: DocumentVersion
  project: Project
  workspace: Workspace
}) {
  const now = new Date()

  if (!baseline.prompt) {
    baseline.prompt = document.content
  }

  if (!evaluation) {
    evaluation = await createEvaluationV2({
      document: document,
      commit: baseline.commit,
      workspace: workspace,
    })
  }

  if (!engine) {
    engine = OptimizationEngine.Identity
  }

  if (!configuration) {
    configuration = {
      scope: {
        instructions: true,
      },
    }
  }

  const isPrepared = trainset && testset
  const isExecuted = isPrepared && optimized?.commit && optimized?.prompt
  const isValidated = isExecuted && baseline.experiment && optimized?.experiment
  const isFinished = isPrepared && isExecuted && isValidated

  const optimization = (await database
    .insert(optimizations)
    .values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      baselineCommitId: baseline.commit.id,
      baselinePrompt: baseline.prompt,
      evaluationUuid: evaluation.uuid,
      engine: engine,
      configuration: configuration,
      trainsetId: trainset?.id,
      testsetId: testset?.id,
      optimizedCommitId: optimized?.commit?.id,
      optimizedPrompt: optimized?.prompt,
      baselineExperimentId: baseline.experiment?.id,
      optimizedExperimentId: optimized?.experiment?.id,
      error: error,
      createdAt: now,
      updatedAt: now,
      preparedAt: isPrepared ? now : undefined,
      executedAt: isExecuted ? now : undefined,
      validatedAt: isValidated ? now : undefined,
      finishedAt: isFinished ? now : undefined,
    })
    .returning()
    .then((r) => r[0]!)) as Optimization

  return optimization
}
