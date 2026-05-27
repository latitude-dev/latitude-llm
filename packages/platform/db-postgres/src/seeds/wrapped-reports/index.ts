import { OrganizationId, ProjectId, WrappedReportId } from "@domain/shared"
import { SEED_ORG_ID } from "@domain/shared/seeding"
import {
  CURRENT_REPORT_VERSION,
  PERSONALITY_KINDS,
  type PersonalityKind,
  pickWrittenAnchor,
  type ReportV2,
  reportV2Schema,
} from "@domain/spans"
import { Effect } from "effect"
import { wrappedReports } from "../../schema/wrapped-reports.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

/**
 * 100 seeded Claude Code Wrapped V2 reports — one per unique fake project.
 *
 * All created on "today" (daysAgo = 0) at 09:00 UTC so they:
 *  - appear in the backoffice analytics page (within the last 7 days)
 *  - all belong to the same leaderboard cohort (same UTC calendar day)
 *
 * Values are random but schema-valid. Token counts range from ~500K to ~30M
 * so the leaderboard ordering is visually interesting.
 */

const REPORT_COUNT = 100

// Fake display identities for variety — the JSONB fields are display-only.
const ORG_NAMES = [
  "TechCorp",
  "StartupAI",
  "DevStudio",
  "BuildCo",
  "CodeLabs",
  "DataFlow",
  "ByteForge",
  "CloudSpark",
  "NeuralBase",
  "PixelDrift",
]

const OWNER_NAMES = [
  "Alice Chen",
  "Bob Rivera",
  "Charlie Kim",
  "Dana Patel",
  "Eli Thompson",
  "Fiona Walsh",
  "George Santos",
  "Hannah Liu",
  "Ivan Morozov",
  "Julia Fernandez",
  "Kevin Osei",
  "Lena Kovacs",
  "Marco Bruno",
  "Nina Okafor",
  "Oscar Lindqvist",
  "Priya Sharma",
  "Quinn Bradley",
  "Rosa Tanaka",
  "Sam Yoshida",
  "Tara Nkosi",
]

const PROJECT_NAMES = [
  "My project",
  "Claude Code",
  "Main app",
  "Backend API",
  "Frontend",
  "Data pipeline",
  "Auth service",
  "Analytics",
  "Mobile app",
  "CLI tools",
]

const BASH_COMMANDS = ["pnpm", "git", "npm", "python3", "cargo", "go", "docker", "make", "tsx", "node"]

/** Seeded random using a simple LCG so values are deterministic across runs. */
function makePrng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function buildReport(i: number, projectId: string, orgId: string): ReportV2 {
  const rand = makePrng(i * 17 + 42)
  const ri = (n: number) => Math.floor(rand() * n)
  const rr = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))

  const orgName = ORG_NAMES[i % ORG_NAMES.length] ?? "Acme"
  const projectName = PROJECT_NAMES[i % PROJECT_NAMES.length] ?? "My project"
  const kind: PersonalityKind = PERSONALITY_KINDS[i % PERSONALITY_KINDS.length] ?? "conductor"

  const sessions = rr(2, 80)
  const toolCalls = rr(100, 5000)
  const filesTouched = rr(5, 200)
  const commandsRun = rr(10, 300)
  const tokensTotal = rr(500_000, 30_000_000)
  const durationMs = rr(1_800_000, 36_000_000)
  const locWritten = rr(100, 5000)
  const locRead = rr(1000, 50000)

  const bashShare = rr(5, 45)
  const readShare = rr(10, 35)
  const editShare = rr(10, 40)
  const remaining = Math.max(0, 100 - bashShare - readShare - editShare)

  // Deterministic week window ending 1–4 days ago relative to "today"
  const windowEndDaysAgo = 0
  const windowEnd = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - windowEndDaysAgo),
  )
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => (rand() < 0.4 ? ri(8) : 0)),
  )

  const report = reportV2Schema.parse({
    project: {
      id: ProjectId(projectId),
      name: projectName,
      slug: projectName.toLowerCase().replace(/\s+/g, "-"),
    },
    organization: {
      id: OrganizationId(orgId),
      name: orgName,
    },
    window: { start: windowStart, end: windowEnd },
    totals: {
      sessions,
      toolCalls,
      durationMs,
      filesTouched,
      commandsRun,
      workspaces: rr(1, 4),
      branches: rr(1, 8),
      commits: rr(0, 30),
      repos: rr(1, 3),
      streakDays: rr(1, 7),
      testsRun: rr(0, 50),
      gitWriteOps: rr(0, 20),
      tokensTotal,
    },
    toolMix: {
      bash: bashShare,
      read: readShare,
      edit: editShare,
      write: Math.floor(remaining * 0.3),
      search: Math.floor(remaining * 0.4),
      research: Math.floor(remaining * 0.1),
      plan: Math.floor(remaining * 0.1),
      other: Math.floor(remaining * 0.1),
    },
    loc: {
      written: locWritten,
      read: locRead,
      added: Math.floor(locWritten * 0.7),
      removed: Math.floor(locWritten * 0.2),
      writtenAnchor: pickWrittenAnchor(locWritten),
      readAnchor: { prefix: "", emphasis: "" },
    },
    topBashCommand:
      rand() > 0.3 ? { pattern: BASH_COMMANDS[ri(BASH_COMMANDS.length)] ?? "pnpm", count: rr(5, 50) } : null,
    workspaceDeepDives: [],
    otherWorkspaceCount: 0,
    heatmap,
    moments: {
      longestSession: { durationMs: rr(600_000, 7_200_000), workspace: null },
      busiestDay: {
        date: windowEnd.toISOString().slice(0, 10),
        toolCalls: rr(20, Math.max(21, Math.floor(toolCalls / sessions))),
      },
      biggestWrite: rand() > 0.3 ? { displayName: "index.ts", lines: rr(50, 400) } : null,
    },
    personality: {
      kind,
      score: Math.round(rand() * 100) / 100,
      evidence: [
        `${Math.round(editShare)}% of your tool calls were Edits`,
        `Touched ${filesTouched} files this week`,
        `${sessions} sessions across the week`,
      ],
    },
    lastReport: {
      sessions: rand() > 0.3 ? rr(1, 60) : null,
      toolCalls: rand() > 0.3 ? rr(80, 4000) : null,
      durationMs: rand() > 0.3 ? rr(1_200_000, 28_000_000) : null,
      filesTouched: rand() > 0.3 ? rr(4, 180) : null,
      locWritten: rand() > 0.3 ? rr(80, 4500) : null,
      tokensTotal: rand() > 0.3 ? rr(400_000, 25_000_000) : null,
    },
  })

  return report
}

const seedWrappedReports: Seeder = {
  name: "wrapped-reports/claude-code-v2",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const now = ctx.scope.dateDaysAgo(0, 9, 0)

        for (let i = 0; i < REPORT_COUNT; i++) {
          const reportId = WrappedReportId(ctx.scope.cuid(`wr:report:${i}`))
          const projectId = ctx.scope.cuid(`wr:proj:${i}`)
          const orgId = SEED_ORG_ID

          const report = buildReport(i, projectId, orgId)

          await ctx.db
            .insert(wrappedReports)
            .values({
              id: reportId,
              type: "claude_code",
              organizationId: orgId,
              projectId: ProjectId(projectId),
              windowStart: report.window.start,
              windowEnd: report.window.end,
              ownerName: OWNER_NAMES[i % OWNER_NAMES.length] ?? "Owner",
              reportVersion: CURRENT_REPORT_VERSION,
              report,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: wrappedReports.id,
              set: { report, updatedAt: now },
            })
        }

        console.log(`  -> wrapped reports: ${REPORT_COUNT} Claude Code V2 reports`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed wrapped reports", cause: error }),
    }).pipe(Effect.asVoid),
}

export const wrappedReportSeeders: readonly Seeder[] = [seedWrappedReports]
