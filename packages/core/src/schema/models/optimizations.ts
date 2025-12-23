import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { OptimizationConfiguration, OptimizationEngine } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { datasets } from './datasets'
import { experiments } from './experiments'
import { projects } from './projects'
import { workspaces } from './workspaces'

export const optimizations = latitudeSchema.table(
  'optimizations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    baselineCommitId: bigint('baseline_commit_id', { mode: 'number' })
      .notNull() // Note: baseline commit is not unique because of multiple trials
      .references(() => commits.id, { onDelete: 'restrict' }),
    baselinePrompt: text('baseline_prompt').notNull(),
    evaluationUuid: uuid('evaluation_uuid').notNull(),
    engine: varchar('engine', { length: 32 })
      .notNull()
      .$type<OptimizationEngine>(),
    configuration: jsonb('configuration')
      .notNull()
      .$type<OptimizationConfiguration>(),
    trainsetId: bigint('trainset_id', { mode: 'number' }).references(
      () => datasets.id, // Note: trainset is not unique because it can be provided by the user
      { onDelete: 'set null' },
    ),
    testsetId: bigint('testset_id', { mode: 'number' }).references(
      () => datasets.id, // Note: testset is not unique because it can be provided by the user
      { onDelete: 'set null' },
    ),
    optimizedCommitId: bigint('optimized_commit_id', {
      mode: 'number',
    })
      .unique()
      .references(() => commits.id, { onDelete: 'set null' }),
    optimizedPrompt: text('optimized_prompt'),
    baselineExperimentId: bigint('baseline_experiment_id', {
      mode: 'number',
    })
      .unique()
      .references(() => experiments.id, { onDelete: 'set null' }),
    optimizedExperimentId: bigint('optimized_experiment_id', {
      mode: 'number',
    })
      .unique()
      .references(() => experiments.id, { onDelete: 'set null' }),
    error: varchar('error', { length: 256 }),
    ...timestamps(),
    preparedAt: timestamp('prepared_at'),
    executedAt: timestamp('executed_at'),
    validatedAt: timestamp('validated_at'),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [
    // table.uuid already has an index by the unique constraint
    index('optimizations_workspace_id_idx').on(table.workspaceId),
    index('optimizations_project_id_idx').on(table.projectId),
    index('optimizations_document_uuid_idx').on(table.documentUuid),
    index('optimizations_baseline_commit_id_idx').on(table.baselineCommitId),
    index('optimizations_evaluation_uuid_idx').on(table.evaluationUuid),
    index('optimizations_engine_idx').on(table.engine, table.createdAt),
    index('optimizations_trainset_id_idx').on(table.trainsetId),
    index('optimizations_testset_id_idx').on(table.testsetId),
    // table.optimizedCommitId already has an index by the unique constraint
    // table.baselineExperimentId already has an index by the unique constraint
    // table.optimizedExperimentId already has an index by the unique constraint
    index('optimizations_created_at_idx').on(table.createdAt),
    index('optimizations_prepared_at_idx').on(table.preparedAt),
    index('optimizations_executed_at_idx').on(table.executedAt),
    index('optimizations_validated_at_idx').on(table.validatedAt),
    index('optimizations_finished_at_idx').on(table.finishedAt),
  ],
)
