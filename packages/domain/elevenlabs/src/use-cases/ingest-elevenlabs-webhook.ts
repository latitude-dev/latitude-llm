import { isSandbox, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { OrganizationId, type ProjectId } from "@domain/shared"
import { ingestSpansWithBillingUseCase } from "@domain/spans"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "@domain/spans/otlp"
import { parseElevenlabsOtelWebhookEvent, verifyElevenlabsSignature } from "@platform/elevenlabs"
import { Effect } from "effect"
import type { ElevenlabsWebhookEndpoint } from "../entities/webhook-endpoint.ts"
import { InvalidElevenlabsWebhookPayloadError } from "../errors.ts"

export interface IngestElevenlabsWebhookInput {
  readonly endpoint: ElevenlabsWebhookEndpoint
  readonly signature: string | null | undefined
  readonly rawBody: string
}

export const ingestElevenlabsWebhookUseCase = Effect.fn("elevenlabs.ingestWebhook")(function* (
  input: IngestElevenlabsWebhookInput,
) {
  yield* verifyElevenlabsSignature({
    signingSecret: input.endpoint.signingSecret,
    signature: input.signature,
    body: input.rawBody,
  })

  const event = parseElevenlabsOtelWebhookEvent(input.rawBody)
  if (!event) {
    return yield* Effect.fail(new InvalidElevenlabsWebhookPayloadError({ reason: "otlp" }))
  }

  const projectRepo = yield* ProjectRepository
  const project = yield* projectRepo.findById(input.endpoint.projectId as ProjectId)

  const organizationRepo = yield* OrganizationRepository
  const organization = yield* organizationRepo.findById(OrganizationId(input.endpoint.organizationId))

  const enrichContext = {
    projectSlug: project.slug,
    conversationId: event.data.conversation_id,
    ...(event.data.agent_id ? { agentId: event.data.agent_id } : {}),
  }

  const otlp = enrichOtlpTraces(event.data.otlp_traces, enrichContext)

  const payload = new TextEncoder().encode(JSON.stringify(otlp))
  const result = yield* ingestSpansWithBillingUseCase({
    organizationId: OrganizationId(input.endpoint.organizationId),
    apiKeyId: `elevenlabs-webhook:${input.endpoint.id}`,
    payload,
    contentType: "application/json",
    isSandbox: isSandbox(organization),
    defaultProjectSlug: project.slug,
  })

  return { acceptedSpans: result.acceptedSpans }
})

const enrichOtlpTraces = (
  request: OtlpExportTraceServiceRequest,
  context: { readonly projectSlug: string; readonly conversationId: string; readonly agentId?: string },
): OtlpExportTraceServiceRequest => ({
  resourceSpans: (request.resourceSpans ?? []).map((resourceSpans) => ({
    ...resourceSpans,
    resource: {
      ...resourceSpans.resource,
      attributes: appendAttributes(resourceSpans.resource?.attributes ?? [], [
        { key: "latitude.project", value: { stringValue: context.projectSlug } },
        { key: "elevenlabs.conversation_id", value: { stringValue: context.conversationId } },
        ...(context.agentId ? [{ key: "elevenlabs.agent_id" as const, value: { stringValue: context.agentId } }] : []),
      ]),
    },
    scopeSpans: (resourceSpans.scopeSpans ?? []).map((scopeSpans) => ({
      ...scopeSpans,
      spans: (scopeSpans.spans ?? []).map((span: OtlpSpan) => ({
        ...span,
        attributes: appendAttributes(span.attributes ?? [], [
          { key: "gen_ai.conversation.id", value: { stringValue: context.conversationId } },
        ]),
      })),
    })),
  })),
})

const appendAttributes = (existing: readonly OtlpKeyValue[], extra: readonly OtlpKeyValue[]): OtlpKeyValue[] => {
  const keys = new Set(existing.map((attr) => attr.key))
  return [...existing, ...extra.filter((attr) => !keys.has(attr.key))]
}
