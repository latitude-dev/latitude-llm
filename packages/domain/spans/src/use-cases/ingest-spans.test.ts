import {
  BillingOverrideRepository,
  BillingUsagePeriodRepository,
  NoCreditsRemainingError,
  StripeSubscriptionLookup,
} from "@domain/billing"
import {
  createFakeBillingOverrideRepository,
  createFakeBillingUsagePeriodRepository,
  createFakeStripeSubscriptionLookup,
  seedBillingUsagePeriod,
} from "@domain/billing/testing"
import { createProject, ProjectRepository } from "@domain/projects"
import type { QueuePublisherShape } from "@domain/queue"
import { QueuePublishError, QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import {
  generateId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SettingsReader,
  SqlClient,
  StorageDisk,
  type StorageDiskPort,
} from "@domain/shared"
import { createFakeSqlClient, createFakeStorageDisk } from "@domain/shared/testing"
import { base64Decode } from "@repo/utils"
import { Effect, Layer, Result } from "effect"
import { describe, expect, it } from "vitest"
import { ingestSpansUseCase } from "./ingest-spans.ts"
import { ingestSpansWithBillingUseCase } from "./ingest-spans-with-billing.ts"

// Branded IDs are CUID2s — 24 characters exactly.
const ORGANIZATION_ID = OrganizationId(generateId())
const PRIMARY_PROJECT_ID = generateId()
const SECONDARY_PROJECT_ID = generateId()

const emptyBatch = new TextEncoder().encode(JSON.stringify({ resourceSpans: [] }))

const buildOtlpJson = (slug?: string): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "test" } }] },
          scopeSpans: [
            {
              scope: { name: "test", version: "1.0.0" },
              spans: [
                {
                  traceId: "0af7651916cd43dd8448eb211c80319c",
                  spanId: "b7ad6b7169203331",
                  name: "test-span",
                  startTimeUnixNano: "1710590400000000000",
                  endTimeUnixNano: "1710590401000000000",
                  attributes: slug ? [{ key: "latitude.project", value: { stringValue: slug } }] : [],
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    }),
  )

const largeSinglePayload = (() => {
  // Pad an OTLP batch past 50 KB by adding many spans.
  const spans = Array.from({ length: 200 }, (_, i) => ({
    traceId: "0af7651916cd43dd8448eb211c80319c",
    spanId: `b7ad6b716920${String(i).padStart(4, "0")}`,
    name: "test-span",
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590401000000000",
    attributes: [{ key: "fill", value: { stringValue: "x".repeat(300) } }],
    status: { code: 1 },
  }))
  return new TextEncoder().encode(
    JSON.stringify({
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "test" } }] },
          scopeSpans: [{ scope: { name: "test", version: "1.0.0" }, spans }],
        },
      ],
    }),
  )
})()

const makeProject = (slug: string, id: string) =>
  createProject({
    id: ProjectId(id),
    organizationId: ORGANIZATION_ID,
    name: `Project ${slug}`,
    slug,
    settings: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastEditedAt: new Date("2026-01-01T00:00:00Z"),
  })

const makeProjectRepository = (resolutions: Record<string, string | null>) =>
  ProjectRepository.of({
    findById: () => Effect.die("not used"),
    findBySlug: (slug: string) => {
      const id = resolutions[slug]
      if (!id) return Effect.fail(new NotFoundError({ entity: "Project", id: slug }))
      return Effect.succeed(makeProject(slug, id))
    },
    list: () => Effect.die("not used"),
    listIncludingDeleted: () => Effect.die("not used"),
    save: () => Effect.die("not used"),
    softDelete: () => Effect.die("not used"),
    hardDelete: () => Effect.die("not used"),
    existsByName: () => Effect.die("not used"),
    countBySlug: () => Effect.die("not used"),
  })

const makeInput = (payload: Uint8Array, opts: { defaultProjectSlug?: string } = {}) => ({
  organizationId: ORGANIZATION_ID,
  apiKeyId: "key-1",
  payload,
  contentType: "application/json",
  ...(opts.defaultProjectSlug ? { defaultProjectSlug: opts.defaultProjectSlug } : {}),
})

const runUseCase = (
  input: ReturnType<typeof makeInput>,
  diskPort: StorageDiskPort,
  publisher: QueuePublisherShape,
  resolutions: Record<string, string | null> = { primary: PRIMARY_PROJECT_ID },
) =>
  ingestSpansUseCase(input).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(StorageDisk, diskPort),
        Layer.succeed(QueuePublisher, publisher),
        Layer.succeed(ProjectRepository, makeProjectRepository(resolutions)),
        Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
      ),
    ),
  )

const createBillingLayer = () => {
  const { repository: billingOverrides } = createFakeBillingOverrideRepository()
  const { repository: billingPeriods } = createFakeBillingUsagePeriodRepository()
  const { service: stripeSubscriptions } = createFakeStripeSubscriptionLookup()

  return {
    billingPeriods,
    layer: Layer.mergeAll(
      Layer.succeed(BillingOverrideRepository, billingOverrides),
      Layer.succeed(BillingUsagePeriodRepository, billingPeriods),
      Layer.succeed(StripeSubscriptionLookup, stripeSubscriptions),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
      Layer.succeed(ProjectRepository, makeProjectRepository({ primary: PRIMARY_PROJECT_ID })),
      Layer.succeed(SettingsReader, {
        getOrganizationSettings: () => Effect.succeed(null),
        getProjectSettings: () => Effect.die("ingestSpansWithBillingUseCase tests do not read project settings"),
      }),
    ),
  }
}

describe("ingestSpansUseCase", () => {
  it("returns zeros for an empty batch and does not publish", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      runUseCase(makeInput(emptyBatch, { defaultProjectSlug: "primary" }), disk, publisher),
    )

    expect(result).toEqual({ totalSpans: 0, acceptedSpans: 0, rejectedSpans: 0 })
    expect(published).toHaveLength(0)
  })

  it("inlines small payloads without writing to disk", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      runUseCase(makeInput(buildOtlpJson(), { defaultProjectSlug: "primary" }), disk, publisher),
    )

    expect(result).toEqual({ totalSpans: 1, acceptedSpans: 1, rejectedSpans: 0 })
    expect(written).toHaveLength(0)
    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("span-ingestion")
    expect(published[0]?.task).toBe("ingest")

    const payload = published[0]?.payload as {
      fileKey: string | null
      inlinePayload: string | null
      defaultProjectId: string | null
    }
    expect(payload.fileKey).toBeNull()
    expect(payload.inlinePayload).toBeDefined()
    expect(payload.defaultProjectId).toBe(PRIMARY_PROJECT_ID)
  })

  it("writes large payloads to disk and sends fileKey", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      runUseCase(makeInput(largeSinglePayload, { defaultProjectSlug: "primary" }), disk, publisher),
    )

    expect(written).toHaveLength(1)
    expect(written[0]?.key).toContain(`tmp-ingest/${ORGANIZATION_ID}/${PRIMARY_PROJECT_ID}/`)

    expect(published).toHaveLength(1)
    const payload = published[0]?.payload as { fileKey: string | null; inlinePayload: string | null }
    expect(payload.fileKey).toBe(written[0]?.key)
    expect(payload.inlinePayload).toBeNull()
  })

  it("fails with QueuePublishError when publish fails (inline path)", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher } = createFakeQueuePublisher({
      publish: (queue) => Effect.fail(new QueuePublishError({ cause: new Error("queue down"), queue })),
    })

    const res = await Effect.runPromise(
      Effect.result(runUseCase(makeInput(buildOtlpJson(), { defaultProjectSlug: "primary" }), disk, publisher)),
    )

    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      expect(res.failure._tag).toBe("QueuePublishError")
    }
  })

  it("passes per-span resolution map and apiKey/org in queue payload", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      runUseCase(makeInput(buildOtlpJson("primary"), { defaultProjectSlug: "primary" }), disk, publisher),
    )

    expect(published).toHaveLength(1)
    const payload = published[0]?.payload as {
      contentType: string
      organizationId: string
      apiKeyId: string
      ingestedAt: string
      defaultProjectId: string | null
      projectIdBySlug: Record<string, string>
    }
    expect(payload.contentType).toBe("application/json")
    expect(payload.organizationId).toBe(ORGANIZATION_ID)
    expect(payload.apiKeyId).toBe("key-1")
    expect(payload.ingestedAt).toBeDefined()
    expect(payload.defaultProjectId).toBe(PRIMARY_PROJECT_ID)
    expect(payload.projectIdBySlug).toEqual({ primary: PRIMARY_PROJECT_ID })
  })

  it("decodes inline payload back to original JSON", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(runUseCase(makeInput(buildOtlpJson(), { defaultProjectSlug: "primary" }), disk, publisher))

    const payload = published[0]?.payload as { inlinePayload: string | null }
    expect(payload.inlinePayload).toBeDefined()
    expect(JSON.parse(new TextDecoder().decode(base64Decode(payload.inlinePayload ?? "")))).toHaveProperty(
      "resourceSpans",
    )
  })
})

describe("ingestSpansUseCase project scoping", () => {
  it("rejects every span when neither header nor per-span attribute resolves", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(runUseCase(makeInput(buildOtlpJson()), disk, publisher, {}))

    expect(result).toEqual({ totalSpans: 1, acceptedSpans: 0, rejectedSpans: 1 })
    expect(published).toHaveLength(0)
  })

  it("rejects spans whose latitude.project slug isn't in the org and keeps the rest", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    const twoSpans = new TextEncoder().encode(
      JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                scope: { name: "test", version: "1.0.0" },
                spans: [
                  {
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: "0000000000000001",
                    name: "ok",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [{ key: "latitude.project", value: { stringValue: "primary" } }],
                    status: { code: 1 },
                  },
                  {
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: "0000000000000002",
                    name: "reject",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [{ key: "latitude.project", value: { stringValue: "other-org-project" } }],
                    status: { code: 1 },
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    const result = await Effect.runPromise(
      runUseCase(makeInput(twoSpans), disk, publisher, { primary: PRIMARY_PROJECT_ID }),
    )

    expect(result).toEqual({ totalSpans: 2, acceptedSpans: 1, rejectedSpans: 1 })
    expect(published).toHaveLength(1)
    const payload = published[0]?.payload as { projectIdBySlug: Record<string, string> }
    expect(payload.projectIdBySlug).toEqual({ primary: PRIMARY_PROJECT_ID })
  })

  it("resolves each unique slug exactly once even across many spans", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher } = createFakeQueuePublisher()

    let findBySlugCalls = 0
    const layer = Layer.mergeAll(
      Layer.succeed(StorageDisk, disk),
      Layer.succeed(QueuePublisher, publisher),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
      Layer.succeed(
        ProjectRepository,
        ProjectRepository.of({
          findById: () => Effect.die("not used"),
          findBySlug: (slug: string) => {
            findBySlugCalls++
            return Effect.succeed(makeProject(slug, slug === "primary" ? PRIMARY_PROJECT_ID : SECONDARY_PROJECT_ID))
          },
          list: () => Effect.die("not used"),
          listIncludingDeleted: () => Effect.die("not used"),
          save: () => Effect.die("not used"),
          softDelete: () => Effect.die("not used"),
          hardDelete: () => Effect.die("not used"),
          existsByName: () => Effect.die("not used"),
          countBySlug: () => Effect.die("not used"),
        }),
      ),
    )

    const manySpans = new TextEncoder().encode(
      JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                scope: { name: "test", version: "1.0.0" },
                spans: Array.from({ length: 50 }, (_, i) => ({
                  traceId: "0af7651916cd43dd8448eb211c80319c",
                  spanId: `aa${String(i).padStart(14, "0")}`,
                  name: "s",
                  startTimeUnixNano: "1710590400000000000",
                  endTimeUnixNano: "1710590401000000000",
                  attributes: [
                    { key: "latitude.project", value: { stringValue: i % 2 === 0 ? "primary" : "secondary" } },
                  ],
                  status: { code: 1 },
                })),
              },
            ],
          },
        ],
      }),
    )

    await Effect.runPromise(ingestSpansUseCase(makeInput(manySpans)).pipe(Effect.provide(layer)))

    expect(findBySlugCalls).toBe(2)
  })
})

describe("ingestSpansWithBillingUseCase", () => {
  it("checks billing before enqueueing spans", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()
    const { layer } = createBillingLayer()

    await Effect.runPromise(
      ingestSpansWithBillingUseCase(makeInput(buildOtlpJson(), { defaultProjectSlug: "primary" })).pipe(
        Effect.provide(
          Layer.mergeAll(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher), layer),
        ),
      ),
    )

    expect(published).toHaveLength(1)
  })

  it("fails before enqueueing when billing blocks the request", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()
    const { billingPeriods, layer } = createBillingLayer()

    await Effect.runPromise(
      billingPeriods
        .upsert(
          seedBillingUsagePeriod({
            organizationId: ORGANIZATION_ID,
            planSlug: "free",
            periodStart: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)),
            periodEnd: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)),
            includedCredits: 20_000,
            consumedCredits: 20_000,
          }),
        )
        .pipe(Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID }))),
    )

    const result = await Effect.runPromise(
      Effect.result(
        ingestSpansWithBillingUseCase(makeInput(buildOtlpJson(), { defaultProjectSlug: "primary" })).pipe(
          Effect.provide(
            Layer.mergeAll(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher), layer),
          ),
        ),
      ),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(NoCreditsRemainingError)
    }
    expect(published).toHaveLength(0)
  })
})
