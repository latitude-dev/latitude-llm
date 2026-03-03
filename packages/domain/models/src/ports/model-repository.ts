import type { Model } from "../entities/model.ts"

/**
 * Port for accessing LLM model data.
 *
 * Implementations handle the data source (API, cache, bundled data, etc.)
 * and are injected into domain use-cases.
 */
export interface ModelRepository {
  getAllModels(): Promise<Model[]>
}
