import { OutboxEventWriter } from "@domain/events"
import { SqlClient } from "@domain/shared"
import { jobTitleSchema, UserRepository } from "@domain/users"
import { OutboxEventWriterLive, UserRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireUserSession } from "../../server/auth.ts"
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

const submitOnboardingSchema = z
  .object({
    jobTitle: jobTitleSchema.exclude(["other"]).optional(),
    customJobTitle: z
      .string()
      .max(256)
      .transform((v) => v.trim())
      .pipe(z.string().min(1))
      .optional(),
    stackChoice: z.enum(["coding-agent-machine", "production-agent"]),
  })
  .refine((d) => d.jobTitle !== undefined || d.customJobTitle !== undefined, {
    message: "Either a known job title or a custom title is required",
  })
  .transform((d) => ({
    resolvedJobTitle: d.jobTitle ?? d.customJobTitle!,
    stackChoice: d.stackChoice,
  }))

export const submitOnboarding = createServerFn({ method: "POST" })
  .inputValidator(submitOnboardingSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserSession()
    const adminClient = getAdminPostgresClient()

    await Effect.runPromise(
      Effect.gen(function* () {
        const sqlClient = yield* SqlClient
        const userRepo = yield* UserRepository
        const outbox = yield* OutboxEventWriter

        yield* sqlClient.transaction(
          Effect.gen(function* () {
            yield* userRepo.setJobTitle({ userId, jobTitle: data.resolvedJobTitle })
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
          }),
        )
      }).pipe(withPostgres(Layer.mergeAll(UserRepositoryLive, OutboxEventWriterLive), adminClient), withTracing),
    )
  })
