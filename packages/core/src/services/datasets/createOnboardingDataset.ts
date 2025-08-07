import type { User, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import { nanoidHashAlgorithm } from './utils'
import type { Column, DatasetRowData, DatasetRowDataContent } from '../../schema'
import type { OnboardingParameters } from '@latitude-data/constants/onboarding'
import { DATASET_COLUMN_ROLES } from '../../constants'
import Transaction from '../../lib/Transaction'
import { createDataset } from './create'
import { DatasetsRepository } from '../../repositories'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'

const ONBOARDING_DATASET_COLUMNS: Column[] = [
  {
    identifier: nanoidHashAlgorithm({ columnName: 'product_name' }),
    name: 'product_name',
    role: DATASET_COLUMN_ROLES.parameter,
  },
  {
    identifier: nanoidHashAlgorithm({ columnName: 'features' }),
    name: 'features',
    role: DATASET_COLUMN_ROLES.parameter,
  },
  {
    identifier: nanoidHashAlgorithm({ columnName: 'target_audience' }),
    name: 'target_audience',
    role: DATASET_COLUMN_ROLES.parameter,
  },
  {
    identifier: nanoidHashAlgorithm({ columnName: 'tone' }),
    name: 'tone',
    role: DATASET_COLUMN_ROLES.parameter,
  },
  {
    identifier: nanoidHashAlgorithm({ columnName: 'word_count' }),
    name: 'word_count',
    role: DATASET_COLUMN_ROLES.parameter,
  },
]

const ONBOARDING_DATASET_ROWS: OnboardingParameters[] = [
  {
    product_name: 'Smart Home Assistant',
    features: 'Voice control, Smart home integration, AI-powered recommendations',
    target_audience: 'Tech-savvy homeowners',
    tone: 'Professional but friendly',
    word_count: 150,
  },
  {
    product_name: 'Fitness Tracker Pro',
    features: 'Heart rate monitoring, Sleep tracking, Workout suggestions',
    target_audience: 'Health-conscious millennials',
    tone: 'Motivational and energetic',
    word_count: 200,
  },
  {
    product_name: 'Eco-Friendly Water Bottle',
    features: 'Temperature control, Filtration system, Durability',
    target_audience: 'Environmentally conscious consumers',
    tone: 'Casual and informative',
    word_count: 120,
  },
  {
    product_name: 'Smart Kitchen Scale',
    features: 'Recipe integration, Nutritional analysis, Portion control',
    target_audience: 'Home cooks and health enthusiasts',
    tone: 'Helpful and encouraging',
    word_count: 180,
  },
  {
    product_name: 'Travel Photography Drone',
    features: 'Compact design, 4K camera, Automated flight modes',
    target_audience: 'Travel photographers and content creators',
    tone: 'Adventurous and inspiring',
    word_count: 250,
  },
  {
    product_name: 'Sustainable Fashion Marketplace',
    features: 'Ethical sourcing, Carbon footprint tracking, Style recommendations',
    target_audience: 'Eco-conscious fashion lovers',
    tone: 'Authentic and passionate',
    word_count: 220,
  },
  {
    product_name: 'Smart Garden Monitor',
    features: 'Plant identification, Watering automation, Growth tracking',
    target_audience: 'Urban gardeners and plant enthusiasts',
    tone: 'Nurturing and educational',
    word_count: 160,
  },
  {
    product_name: 'Virtual Reality Fitness Game',
    features: 'Immersive workouts, Multiplayer challenges, Progress tracking',
    target_audience: 'Gamers interested in fitness',
    tone: 'Energetic and fun',
    word_count: 190,
  },
  {
    product_name: 'Smart Baby Monitor',
    features: 'Sleep analysis, Environmental monitoring, Video streaming',
    target_audience: 'New parents and caregivers',
    tone: 'Reassuring and trustworthy',
    word_count: 170,
  },
  {
    product_name: 'Digital Art Creation Tool',
    features: 'AI-assisted drawing, Cloud collaboration, Asset library',
    target_audience: 'Digital artists and designers',
    tone: 'Creative and empowering',
    word_count: 210,
  },
]

export async function createOnboardingDataset(
  {
    author,
    workspace,
  }: {
    author: User
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (trx) => {
    const repo = new DatasetsRepository(workspace.id, trx)
    const datasets = await repo.findByName('onboarding dataset')
    const dataset = datasets[0]
    if (dataset) return Result.ok(dataset)

    const createdDataset = await createDataset(
      {
        author,
        workspace,
        data: {
          name: 'onboarding dataset',
          columns: ONBOARDING_DATASET_COLUMNS,
        },
      },
      transaction,
    ).then((r) => r.unwrap())

    // Create all rows in a single batch operation
    const rowsData = ONBOARDING_DATASET_ROWS.map((rowData) =>
      ONBOARDING_DATASET_COLUMNS.reduce((acc, column) => {
        acc[column.identifier] = rowData[
          column.name as keyof typeof rowData
        ] as DatasetRowDataContent

        return acc
      }, {} as DatasetRowData),
    )

    const rowsResult = await insertRowsInBatch(
      {
        dataset: createdDataset,
        data: {
          rows: rowsData,
        },
      },
      transaction,
    )

    if (rowsResult.error) return rowsResult

    return Result.ok(createdDataset)
  })
}
