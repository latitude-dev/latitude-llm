import { env } from '@latitude-data/env'
import { pick } from 'lodash-es'
import {
  CLOUD_MESSAGES,
  EvaluationV2,
  OPTIMIZATION_MAX_ROWS,
  OPTIMIZATION_MAX_TIME,
  OPTIMIZATION_MAX_TOKENS,
  OPTIMIZATION_MIN_ROWS,
  OPTIMIZATION_TESTSET_SPLIT,
  OptimizationConfiguration,
  OptimizationEngine,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { prepareOptimizationJobKey } from '../../jobs/job-definitions/optimizations/prepareOptimizationJob'
import { queues } from '../../jobs/queues'
import { BadRequestError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowsRepository } from '../../repositories'
import { findWorkspaceUserById } from '../../queries/users/findInWorkspace'
import { DatasetRowData } from '../../schema/models/datasetRows'
import { Column } from '../../schema/models/datasets'
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
import { maskParameter } from './shared'

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

  const engine = OptimizationEngine.Gepa

  const validating = await validateConfiguration({
    engine: engine,
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
    // Note: this cannot be inside the same transaction as the parent, because
    // of limitations of the transaction class. When this finishes it will
    // close the underlying transaction and the following transaction call
    // will not trigger the callbacks correctly
    const splitting = await splitDataset({
      uuid: uuid,
      parameters: [...parameters],
      dataset: dataset,
      configuration: configuration,
      workspace: workspace,
    })
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
          engine: engine,
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
  engine: OptimizationEngine
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

  if (
    !configuration.scope?.configuration &&
    !configuration.scope?.instructions
  ) {
    return Result.error(
      new BadRequestError('At least one optimization scope is required'),
    )
  }

  if (
    configuration.budget?.time !== undefined &&
    (configuration.budget?.time < 0 ||
      configuration.budget?.time > OPTIMIZATION_MAX_TIME)
  ) {
    return Result.error(
      new BadRequestError('Time budget must be a number between 0 and 2 hours'),
    )
  }

  if (
    configuration.budget?.tokens !== undefined &&
    (configuration.budget?.tokens < 0 ||
      configuration.budget?.tokens > OPTIMIZATION_MAX_TOKENS)
  ) {
    return Result.error(
      new BadRequestError('Token budget must be a number between 0 and 100M'),
    )
  }

  return Result.ok(configuration)
}

const SPLIT_BATCH_SIZE = 1000

async function processRows({
  parameters,
  rows,
  columns: columnsList,
  configuration,
  maskPii = false,
}: {
  parameters: string[]
  rows: DatasetRowData[]
  columns: Column[]
  configuration: OptimizationConfiguration
  maskPii?: boolean
}) {
  const columns: Record<string, Column> = {}
  for (const parameter of parameters) {
    const column = configuration.parameters?.[parameter]?.column ?? parameter
    columns[parameter] = columnsList.find((c) => c.name === column)!
  }

  for (const row of rows) {
    for (const parameter of parameters) {
      let value = row[columns[parameter].identifier]

      if (maskPii && configuration.parameters?.[parameter]?.isPii) {
        value = maskParameter({ parameter, value, configuration })
      }

      row[columns[parameter].identifier] = value ?? undefined
    }
  }

  return Result.ok(rows)
}

async function splitDataset(
  {
    uuid,
    parameters,
    dataset,
    configuration,
    workspace,
  }: {
    uuid: string
    parameters: string[]
    dataset: Dataset
    configuration: OptimizationConfiguration
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  let rowsRepository = new DatasetRowsRepository(workspace.id)
  let rows = await rowsRepository.getCountByDataset(dataset.id)
  rows = Math.min(rows, OPTIMIZATION_MAX_ROWS)

  if (rows < OPTIMIZATION_MIN_ROWS) {
    return Result.error(
      new BadRequestError(
        `At least ${OPTIMIZATION_MIN_ROWS} dataset rows are required`,
      ),
    )
  }

  const trainrows = Math.ceil(rows * OPTIMIZATION_TESTSET_SPLIT)
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

  if (!dataset.authorId) {
    return Result.error(new BadRequestError('Dataset has no author'))
  }

  const finding = await findWorkspaceUserById({
    workspaceId: workspace.id,
    id: dataset.authorId,
  })
  if (finding.error) {
    return Result.error(finding.error)
  }
  const author = finding.value

  return await transaction.call(async (tx) => {
    const creatingtr = await createDataset(
      {
        data: {
          name: `${dataset.name} / Trainset #${uuid.slice(0, 8)}`,
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
          name: `${dataset.name} / Testset #${uuid.slice(0, 8)}`,
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

    rowsRepository = new DatasetRowsRepository(workspace.id, tx)

    let processed = 0
    while (processed < rows) {
      const batch = await rowsRepository.findByDatasetWithOffsetAndLimit({
        datasetId: dataset.id,
        offset: processed,
        limit: Math.min(rows - processed, SPLIT_BATCH_SIZE),
      })
      if (batch.length < 1) {
        break
      }

      const sample = [...batch].sort(() => Math.random() - 0.5)
      const split = Math.floor(sample.length * OPTIMIZATION_TESTSET_SPLIT)

      let trainbatch = sample.slice(0, split).map((r) => r.rowData)
      if (trainbatch.length > 0) {
        const processing = await processRows({
          parameters: parameters,
          rows: trainbatch,
          columns: dataset.columns,
          configuration: configuration,
          maskPii: true,
        })
        if (processing.error) {
          return Result.error(processing.error)
        }
        trainbatch = processing.value

        const inserting = await insertRowsInBatch(
          { dataset: trainset, data: { rows: trainbatch } },
          transaction,
        )
        if (inserting.error) {
          return Result.error(inserting.error)
        }
      }

      let testbatch = sample.slice(split).map((r) => r.rowData)
      if (testbatch.length > 0) {
        const processing = await processRows({
          parameters: parameters,
          rows: testbatch,
          columns: dataset.columns,
          configuration: configuration,
          maskPii: false, // Note: the testset must be untouched for validation
        })
        if (processing.error) {
          return Result.error(processing.error)
        }
        testbatch = processing.value

        const inserting = await insertRowsInBatch(
          { dataset: testset, data: { rows: testbatch } },
          transaction,
        )
        if (inserting.error) {
          return Result.error(inserting.error)
        }
      }

      processed += batch.length
    }

    return Result.ok({ trainset, testset })
  })
}
