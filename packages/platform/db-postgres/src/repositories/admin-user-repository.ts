import {
  type AdminUserDetails,
  type AdminUserMembership,
  AdminUserRepository,
  type AdminUserSession,
} from "@domain/admin"
import { NotFoundError, SqlClient, type SqlClientShape, type UserId } from "@domain/shared"
import { and, eq, gt, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { members, organizations, sessions, users } from "../schema/better-auth.ts"

type UserRoleValue = AdminUserDetails["role"]
type MemberRoleValue = AdminUserMembership["role"]

/**
 * Live layer for the backoffice user-detail port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter and
 * therefore see every user and every membership row in the database. This
 * is only safe when the SqlClient was constructed with
 * `OrganizationId("system")` (the default on `getAdminPostgresClient()`) so
 * RLS is bypassed. Never provide this layer on the standard app-facing
 * Postgres client.
 */
export const AdminUserRepositoryLive = Layer.effect(
  AdminUserRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (userId: UserId) =>
        Effect.gen(function* () {
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: users.id,
                email: users.email,
                name: users.name,
                image: users.image,
                role: users.role,
                createdAt: users.createdAt,
              })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1),
          )
          const row = rows[0]
          if (!row) {
            return yield* Effect.fail(new NotFoundError({ entity: "User", id: userId }))
          }

          const membershipRows = yield* sqlClient.query((db) =>
            db
              .select({
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
                role: members.role,
              })
              .from(members)
              .innerJoin(organizations, eq(members.organizationId, organizations.id))
              .where(inArray(members.userId, [row.id]))
              .orderBy(organizations.name),
          )

          // Active sessions only — `expires_at > now()`. Better Auth's
          // admin plugin enforces the same filter for `listUserSessions`,
          // and surfacing already-expired rows would mislead staff into
          // thinking sessions are live when they aren't. Filter in SQL
          // so the wire-level payload doesn't carry the long tail of
          // expired rows for chatty users.
          const now = new Date()
          const liveSessions = yield* sqlClient.query((db) =>
            db
              .select({
                id: sessions.id,
                ipAddress: sessions.ipAddress,
                userAgent: sessions.userAgent,
                createdAt: sessions.createdAt,
                updatedAt: sessions.updatedAt,
                expiresAt: sessions.expiresAt,
                impersonatedBy: sessions.impersonatedBy,
              })
              .from(sessions)
              .where(and(eq(sessions.userId, row.id), gt(sessions.expiresAt, now)))
              .orderBy(sessions.updatedAt),
          )

          // Best-effort cross-reference of impersonator emails so the
          // UI can render "impersonated by carlos@latitude.so" inline
          // without a second round-trip. We use a single lookup per
          // distinct impersonator id; missing rows surface as `null`
          // and the UI degrades to showing the raw user id.
          const impersonatorIds = Array.from(
            new Set(liveSessions.map((s) => s.impersonatedBy).filter((id): id is string => typeof id === "string")),
          )
          const impersonatorEmailById = new Map<string, string>()
          if (impersonatorIds.length > 0) {
            const impersonatorRows = yield* sqlClient.query((db) =>
              db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, impersonatorIds)),
            )
            for (const r of impersonatorRows) impersonatorEmailById.set(r.id, r.email)
          }

          // Sort impersonation rows first (red-flag rows belong at the
          // top of the panel), then by `updatedAt` desc so the freshest
          // activity reads first within each group.
          const userSessions: AdminUserSession[] = liveSessions
            .map((s) => ({
              id: s.id,
              ipAddress: s.ipAddress ?? null,
              userAgent: s.userAgent ?? null,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
              expiresAt: s.expiresAt,
              impersonatedByUserId: s.impersonatedBy ?? null,
              impersonatedByEmail: s.impersonatedBy ? (impersonatorEmailById.get(s.impersonatedBy) ?? null) : null,
            }))
            .sort((a, b) => {
              const aImp = a.impersonatedByUserId !== null
              const bImp = b.impersonatedByUserId !== null
              if (aImp !== bImp) return aImp ? -1 : 1
              return b.updatedAt.getTime() - a.updatedAt.getTime()
            })

          const details: AdminUserDetails = {
            id: row.id,
            email: row.email,
            name: row.name ?? null,
            image: row.image ?? null,
            role: row.role as UserRoleValue,
            memberships: membershipRows.map((m) => ({
              organizationId: m.organizationId,
              organizationName: m.organizationName,
              organizationSlug: m.organizationSlug,
              role: m.role as MemberRoleValue,
            })),
            sessions: userSessions,
            createdAt: row.createdAt,
          }
          return details
        }),
      findActiveSessionTokenForUser: (userId, sessionId) =>
        Effect.gen(function* () {
          const now = new Date()
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ token: sessions.token })
              .from(sessions)
              .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
              .limit(1),
          )
          const found = rows[0]
          if (!found) {
            // Collapse "session id not found" and "session belongs to
            // another user" into the same NotFoundError so a probing
            // caller can't distinguish the two — the existence of a
            // session id under a different user is itself sensitive.
            return yield* Effect.fail(new NotFoundError({ entity: "Session", id: sessionId }))
          }
          return found.token
        }),
    }
  }),
)
