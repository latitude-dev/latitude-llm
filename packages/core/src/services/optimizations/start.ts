import { env } from '@latitude-data/env'
import { pick } from 'lodash-es'
import {
  CLOUD_MESSAGES,
  EvaluationV2,
  OPTIMIZATION_DATASET_SPLIT,
  OptimizationConfiguration,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { prepareOptimizationJobKey } from '../../jobs/job-definitions/optimizations/prepareOptimizationJob'
import { queues } from '../../jobs/queues'
import { BadRequestError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowsRepository, UsersRepository } from '../../repositories'
import { optimizations } from '../../schema/models/optimizations'
import { Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
import { createDataset } from '../datasets/create'
import { scanDocumentContent } from '../documents'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'
import { isFeatureEnabledByName } from '../workspaceFeatures/isFeatureEnabledByName'

export async function startOptimization(
  {
    evaluation,
    dataset,
    configuration,
    document,
    baselineCommit,
    project,
    workspace,
  }: {
    evaluation: EvaluationV2
    dataset?: Dataset
    configuration: OptimizationConfiguration
    document: DocumentVersion
    baselineCommit: Commit
    project: Project
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const uuid = generateUUIDIdentifier()

  if (!env.LATITUDE_CLOUD) {
    return Result.error(new BadRequestError(CLOUD_MESSAGES.promptOptimization))
  }

  const checking = await isFeatureEnabledByName(workspace.id, 'optimizations')
  if (checking.error) {
    return Result.error(checking.error)
  }

  const enabled = checking.value
  if (!enabled) {
    return Result.error(
      new BadRequestError('Optimizations feature flag is not enabled'),
    )
  }

  const scanning = await scanDocumentContent({
    document: document,
    commit: baselineCommit,
  })
  if (scanning.error) {
    return Result.error(scanning.error)
  }

  const baselinePrompt = document.content
  const { parameters, errors } = scanning.value
  if (errors.length > 0) {
    return Result.error(
      new BadRequestError('Cannot optimize an invalid prompt'),
    )
  }

  const validating = await validateConfiguration({
    configuration: configuration,
    parameters: [...parameters],
    dataset: dataset,
  })
  if (validating.error) {
    return Result.error(validating.error)
  }
  configuration = validating.value

  const specification = getEvaluationMetricSpecification(evaluation)
  if (!specification.supportsBatchEvaluation) {
    return Result.error(
      new BadRequestError(
        'Cannot optimize for an evaluation that does not support batch evaluation',
      ),
    )
  }

  // BONUS(AO/OPT): Implement optimization for labeled datasets
  if (specification.requiresExpectedOutput) {
    return Result.error(
      new BadRequestError(
        'Cannot optimize for an evaluation that requires an expected output',
      ),
    )
  }

  let trainset: Dataset | undefined
  let testset: Dataset | undefined
  if (dataset) {
    const splitting = await splitDataset(
      { uuid, dataset, workspace },
      transaction,
    )
    if (splitting.error) {
      return Result.error(splitting.error)
    }
    trainset = splitting.value.trainset
    testset = splitting.value.testset
  }

  return await transaction.call(
    async (tx) => {
      const now = new Date()

      const optimization = (await tx
        .insert(optimizations)
        .values({
          uuid: uuid,
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          baselineCommitId: baselineCommit.id,
          baselinePrompt: baselinePrompt,
          evaluationUuid: evaluation.uuid,
          configuration: configuration,
          trainsetId: trainset?.id,
          testsetId: testset?.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .then((r) => r[0]!)) as Optimization

      return Result.ok({ optimization })
    },
    async ({ optimization }) => {
      const payload = {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      }

      const { optimizationsQueue } = await queues()
      await optimizationsQueue.add('prepareOptimizationJob', payload, {
        jobId: `${optimization.uuid}-prepareOptimizationJob`,
        attempts: 1,
        deduplication: { id: prepareOptimizationJobKey(payload) },
      })

      await publisher.publishLater({
        type: 'optimizationStarted',
        data: payload,
      })
    },
  )
}

async function validateConfiguration({
  configuration,
  parameters,
  dataset,
}: {
  configuration: OptimizationConfiguration
  parameters: string[]
  dataset?: Dataset
}) {
  if (configuration.parameters) {
    configuration.parameters = pick(configuration.parameters, parameters)
  }

  for (const parameter of parameters) {
    const column = configuration.parameters?.[parameter]?.column ?? parameter

    if (dataset && !dataset.columns.find((c) => c.name === column)) {
      return Result.error(
        new BadRequestError(`Column '${column}' not found in dataset`),
      )
    }
  }

  return Result.ok(configuration)
}

const SPLIT_BATCH_SIZE = 1000

async function splitDataset(
  {
    uuid,
    dataset,
    workspace,
  }: {
    uuid: string
    dataset: Dataset
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const rowsRepository = new DatasetRowsRepository(workspace.id)
  const rows = await rowsRepository.getCountByDataset(dataset.id)

  const trainrows = Math.floor(rows * OPTIMIZATION_DATASET_SPLIT)
  if (trainrows < 1) {
    return Result.error(
      new BadRequestError('Cannot optimize with an empty trainset'),
    )
  }

  const testrows = rows - trainrows
  if (testrows < 1) {
    return Result.error(
      new BadRequestError('Cannot optimize with an empty testset'),
    )
  }

  const userRepository = new UsersRepository(workspace.id)
  const finding = await userRepository.find(dataset.authorId)
  if (finding.error) {
    return Result.error(finding.error)
  }
  const author = finding.value

  return await transaction.call(async () => {
    const creatingtr = await createDataset(
      {
        data: {
          name: `${dataset.name} - Trainset #${uuid.slice(0, 8)}`,
          columns: dataset.columns,
        },
        author: author,
        workspace: workspace,
      },
      transaction,
    )
    if (creatingtr.error) {
      return Result.error(creatingtr.error)
    }
    const trainset = creatingtr.value

    const creatingte = await createDataset(
      {
        data: {
          name: `${dataset.name} - Testset #${uuid.slice(0, 8)}`,
          columns: dataset.columns,
        },
        author: author,
        workspace: workspace,
      },
      transaction,
    )
    if (creatingte.error) {
      return Result.error(creatingte.error)
    }
    const testset = creatingte.value

    let offset = 0
    while (true) {
      const batch = await rowsRepository.findByDatasetWithOffsetAndLimit({
        datasetId: dataset.id,
        offset: offset,
        limit: SPLIT_BATCH_SIZE,
      })
      if (batch.length < 1) {
        break
      }

      const sample = [...batch].sort(() => Math.random() - 0.5)
      const split = Math.floor(sample.length * OPTIMIZATION_DATASET_SPLIT)

      const trainbatch = sample.slice(0, split).map((r) => r.rowData)
      if (trainbatch.length > 0) {
        const inserting = await insertRowsInBatch(
          { dataset: trainset, data: { rows: trainbatch } },
          transaction,
        )
        if (inserting.error) {
          return Result.error(inserting.error)
        }
      }

      const testbatch = sample.slice(split).map((r) => r.rowData)
      if (testbatch.length > 0) {
        const inserting = await insertRowsInBatch(
          { dataset: testset, data: { rows: testbatch } },
          transaction,
        )
        if (inserting.error) {
          return Result.error(inserting.error)
        }
      }

      if (batch.length < SPLIT_BATCH_SIZE) {
        break
      } else {
        offset += SPLIT_BATCH_SIZE
      }
    }

    return Result.ok({ trainset, testset })
  })
}
