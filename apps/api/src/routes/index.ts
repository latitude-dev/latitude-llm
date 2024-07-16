import Paths from '$src/common/Paths'
import { Router } from 'express'

import apiRouter from './api'

const router = Router()

router.use(Paths.Api.Base, apiRouter)

export default router
