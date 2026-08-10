import type { OperationModule } from "../core/mount.ts"
import { accountModule } from "./account.ts"
import { analyticsModule } from "./analytics.ts"
import { annotationsModule } from "./annotations.ts"
import { apiKeysModule } from "./api-keys.ts"
import { datasetsModule } from "./datasets.ts"
import { experimentsModule } from "./experiments.ts"
import { importsModule } from "./imports.ts"
import { incidentsModule } from "./incidents.ts"
import { membersModule } from "./members.ts"
import { memoryModule } from "./memory.ts"
import { monitorsModule } from "./monitors.ts"
import { oauthKeysModule } from "./oauth-keys.ts"
import { projectsModule } from "./projects.ts"
import { savedSearchesModule } from "./saved-searches.ts"
import { scoresModule } from "./scores.ts"
import { sessionsModule } from "./sessions.ts"
import { signalsModule } from "./signals.ts"
import { spansModule } from "./spans.ts"
import { toolsModule } from "./tools.ts"
import { tracesModule } from "./traces.ts"
import { usersModule } from "./users.ts"

// Order is load-bearing: `openapi.json` path order and `mcp.json` tool order
// derive from mount order, which follows this manifest.
export const operationModules: ReadonlyArray<OperationModule> = [
  projectsModule,
  scoresModule,
  annotationsModule,
  tracesModule,
  toolsModule,
  usersModule,
  savedSearchesModule,
  signalsModule,
  incidentsModule,
  datasetsModule,
  apiKeysModule,
  oauthKeysModule,
  accountModule,
  membersModule,
  monitorsModule,
  analyticsModule,
  spansModule,
  experimentsModule,
  sessionsModule,
  memoryModule,
  importsModule,
]
