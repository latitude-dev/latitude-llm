import { OutboxEventWriter } from "@domain/events"
import { stackChoiceSchema, stackChoiceToOnboardingType } from "@domain/marketing"
import { ProjectRepository } from "@domain/projects"
import { BadRequestError, ProjectId, SqlClient } from "@domain/shared"
import { HEARD_ABOUT_US_OTHER_MAX_LENGTH, heardAboutUsSchema, UserRepository } from "@domain/users"
import { OutboxEventWriterLive, ProjectRepositoryLive, UserRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { isStorablePhoneNumber } from "../../lib/phone-countries.ts"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"
import { reportUnknownCallingCode } from "../../server/unknown-calling-code-report.ts"

// Shape only, so obvious junk is rejected at the boundary and never reaches the reporter below.
const E164_SHAPE = /^\+[1-9]\d{4,14}$/

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
        .refine((v) => v.length === 0 || E164_SHAPE.test(v), {
          message: "Phone number must include a calling code, e.g. +15550100",
        })
        .transform((v) => (v.length > 0 ? v : undefined)),
    )
    .optional(),
  heardAboutUs: heardAboutUsSchema,
  heardAboutUsOther: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .max(HEARD_ABOUT_US_OTHER_MAX_LENGTH)
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

    if (data.phoneNumber !== undefined && !isStorablePhoneNumber(data.phoneNumber)) {
      reportUnknownCallingCode(data.phoneNumber)
      throw new BadRequestError({ message: "Phone number must start with a known calling code" })
    }

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
              heardAboutUs: data.heardAboutUs,
              heardAboutUsOther: data.heardAboutUsOther,
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
