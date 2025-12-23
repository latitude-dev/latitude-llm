import { type InferSelectModel } from 'drizzle-orm'
import { optimizations } from '../optimizations'

export type Optimization = InferSelectModel<typeof optimizations>
