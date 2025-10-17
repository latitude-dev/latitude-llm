import { type InferSelectModel } from 'drizzle-orm'

import { sessions } from '../sessions'

export type Session = InferSelectModel<typeof sessions>
