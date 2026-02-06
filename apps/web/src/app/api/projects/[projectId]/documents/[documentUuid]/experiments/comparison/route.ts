import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const params = Object.fromEntries(searchParams.entries())
      const experimentUuids = params.uuids?.split(',') ?? []

      const scope = new ExperimentsRepository(workspace.id)

      const experiments: ExperimentWithScores[] = await Promise.all(
        experimentUuids.map(async (uuid) => {
          const experimentResult = scope.findByUuid(uuid)
          const scoresResult = scope.getScores(uuid)

          await Promise.all([experimentResult, scoresResult])
          const experiment = await experimentResult.then((r) => r.unwrap())
          const scores = await scoresResult.then((r) => r.unwrap())
          const runMetadata = await scope
            .getRunMetadata(uuid)
            .then((r) => r.unwrap())

          return {
            ...experiment,
            scores,
            runMetadata,
          } as ExperimentWithScores
        }),
      )

      return NextResponse.json(experiments, { status: 200 })
    },
  ),
)
