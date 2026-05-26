import { OutboxEventWriter } from "@domain/events"
import { stackChoiceSchema, stackChoiceToOnboardingType } from "@domain/marketing"
import { ProjectRepository } from "@domain/projects"
import { ProjectId, SqlClient } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { OutboxEventWriterLive, ProjectRepositoryLive, UserRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getBetterAuth } from "../../server/clients.ts"

export const updateUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    await getBetterAuth().api.updateUser({
      body: {
        name: data.name,
      },
      headers: await getRequestHeaders(),
    })
  })

const submitOnboardingSchema = z.object({
  jobTitle: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(256)),
  phoneNumber: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .max(64)
        .transform((v) => (v.length > 0 ? v : undefined)),
    )
    .optional(),
  stackChoice: stackChoiceSchema,
  projectId: z.string(),
})

export const submitOnboarding = createServerFn({ method: "POST" })
  .inputValidator(submitOnboardingSchema)
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireSession()
    const adminClient = getAdminPostgresClient()

    const onboardingType = stackChoiceToOnboardingType(data.stackChoice)

    await Effect.runPromise(
      Effect.gen(function* () {
        const sqlClient = yield* SqlClient
        const userRepo = yield* UserRepository
        const projectRepo = yield* ProjectRepository
        const outbox = yield* OutboxEventWriter

        yield* sqlClient.transaction(
          Effect.gen(function* () {
            yield* userRepo.update({
              userId,
              jobTitle: data.jobTitle,
              phoneNumber: data.phoneNumber,
            })
            yield* outbox.write({
              eventName: "UserOnboardingCompleted",
              aggregateType: "user",
              aggregateId: userId,
              organizationId: "system",
              payload: {
                userId,
                stackChoice: data.stackChoice,
              },
            })
            const project = yield* projectRepo.findById(ProjectId(data.projectId))
            yield* projectRepo.save({
              ...project,
              settings: { ...(project.settings ?? {}), onboardingType },
            })
          }),
        )
      }).pipe(
        withPostgres(
          Layer.mergeAll(UserRepositoryLive, ProjectRepositoryLive, OutboxEventWriterLive),
          adminClient,
          organizationId,
        ),
        withTracing,
      ),
    )
  })
