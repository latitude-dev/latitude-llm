import { datasetRowSeeders } from "./datasets/index.ts"
import { spanSeeders } from "./spans/index.ts"

export const allSeeders = [...spanSeeders, ...datasetRowSeeders]
