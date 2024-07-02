import Paths from '@src/common/Paths'
import { Router } from 'express'

import { completions } from './routes'

const router = Router()

router.use(Paths.Api.V1.Chat.Completions, completions)

export default router
