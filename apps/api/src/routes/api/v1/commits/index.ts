import Paths from '$src/common/Paths'
import { Router } from 'express'

import { promptRoute } from './routes'

const router = Router()

router.get(Paths.Api.V1.Commits.Prompt, promptRoute)

export default router
