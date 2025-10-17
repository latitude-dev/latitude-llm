import { type InferSelectModel } from 'drizzle-orm'

import { datasetRows } from '../datasetRows'

export type DatasetRow = InferSelectModel<typeof datasetRows>
