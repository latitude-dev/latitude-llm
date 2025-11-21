import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { MembershipsRepository } from '@latitude-data/core/repositories'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      { user, workspace }: { user: User; workspace: Workspace },
    ) => {
      const membershipsScope = new MembershipsRepository(workspace.id)
      const membership = await membershipsScope
        .findByUserId(user.id)
        .then((r) => r.unwrap())

      return NextResponse.json(
        {
          ...user,
          notifications: {
            wantToReceiveWeeklyEmail: membership.wantToReceiveWeeklyEmail,
            wantToReceiveEscalatingIssuesEmail:
              membership.wantToReceiveEscalatingIssuesEmail,
          },
        },
        { status: 200 },
      )
    },
  ),
)
