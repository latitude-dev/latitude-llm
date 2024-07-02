import Paths from '@src/common/Paths'
import { Router } from 'express'

import chatRouter from './chat'

const router = Router()

router.use(Paths.Api.V1.Chat.Base, chatRouter)

export default router
