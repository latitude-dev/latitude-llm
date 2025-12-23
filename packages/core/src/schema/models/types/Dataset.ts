import { type InferSelectModel } from 'drizzle-orm'

import { datasets } from '../datasets'

export type Dataset = InferSelectModel<typeof datasets>
// TODO(AO/OPT): Implement and use in frontend
export type DatasetDto = Dataset & {
  optimizationUuid?: string
}
