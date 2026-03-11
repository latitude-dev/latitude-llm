export { type Dataset, type DatasetVersion, DatasetNotFoundError } from "./entities/dataset.ts"
export { type DatasetRow, RowNotFoundError } from "./entities/dataset-row.ts"

export { DatasetRepository } from "./ports/dataset-repository.ts"
export { DatasetRowRepository, type DatasetRowRepositoryShape } from "./ports/dataset-row-repository.ts"

export { buildValidRowId } from "./validate-row-id.ts"

export { createDataset } from "./use-cases/create-dataset.ts"
export { listDatasets } from "./use-cases/list-datasets.ts"
export { insertRows } from "./use-cases/insert-rows.ts"
export { listRows } from "./use-cases/list-rows.ts"
export { getRowDetail } from "./use-cases/get-row-detail.ts"
