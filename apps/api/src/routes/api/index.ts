import Paths from '@src/common/Paths'
import { Router } from 'express'

import v1Router from './v1'

const router = Router()

router.use(Paths.Api.V1.Base, v1Router)

export default router
