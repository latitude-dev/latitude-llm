import type { AgentScoreExplanation } from "@domain/agent-score"
import { date, doublePrecision, index, integer, jsonb, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

export const agentScoreSnapshots = latitudeSchema.table(
  "agent_score_snapshots",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    scoringVersion: varchar("scoring_version", { length: 160 }).notNull(),
    windowDays: integer("window_days").notNull(),
    eligibleSessionCount: integer("eligible_session_count").notNull(),
    score: doublePrecision("score").notNull(),
    scoreLower: doublePrecision("score_lower").notNull(),
    scoreUpper: doublePrecision("score_upper").notNull(),
    outcome: doublePrecision("outcome").notNull(),
    outcomeLower: doublePrecision("outcome_lower").notNull(),
    outcomeUpper: doublePrecision("outcome_upper").notNull(),
    reliability: doublePrecision("reliability").notNull(),
    reliabilityLower: doublePrecision("reliability_lower").notNull(),
    reliabilityUpper: doublePrecision("reliability_upper").notNull(),
    cost: doublePrecision("cost").notNull(),
    costLower: doublePrecision("cost_lower").notNull(),
    costUpper: doublePrecision("cost_upper").notNull(),
    speed: doublePrecision("speed").notNull(),
    speedLower: doublePrecision("speed_lower").notNull(),
    speedUpper: doublePrecision("speed_upper").notNull(),
    safety: doublePrecision("safety").notNull(),
    safetyLower: doublePrecision("safety_lower").notNull(),
    safetyUpper: doublePrecision("safety_upper").notNull(),
    // Null when no policy rule applied, so the page can attribute capped points to the rule itself.
    policyCap: doublePrecision("policy_cap"),
    explanation: jsonb("explanation").$type<AgentScoreExplanation>(),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    organizationRLSPolicy("agent_score_snapshots"),
    uniqueIndex("agent_score_snapshots_project_date_idx").on(t.organizationId, t.projectId, t.date),
    // The weekly digest sweep reads a date range across every organization, which the unique index
    // cannot serve because organization leads it.
    index("agent_score_snapshots_date_idx").on(t.date),
  ],
)
