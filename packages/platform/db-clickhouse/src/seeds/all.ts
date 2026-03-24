import { datasetRowSeeders } from "./datasets/index.ts"
import { scoreSeeders } from "./scores/index.ts"
import { spanSeeders } from "./spans/index.ts"

export const allSeeders = [...spanSeeders, ...scoreSeeders, ...datasetRowSeeders]
