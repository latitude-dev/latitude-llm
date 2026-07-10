# Mastra signal provider

> **Documentation**: `dev-docs/agent-dispatch.md`, `docs/agent-dispatch/webhooks.mdx`, `docs/telemetry/frameworks/mastra.mdx`

## Status

This spec proposes a first-party `@latitude-data/mastra` package that receives Latitude Agent Dispatch webhooks and turns them into Mastra notification signals.

The first release uses the existing generic webhook integration. It does not add a Mastra dispatch kind, change the webhook body, or add a second outbound delivery pipeline.

Mastra signal providers are beta. This integration targets `@mastra/core@1.42.0` or later, matching Mastra's custom signal provider announcement. Earlier `1.39.x` releases exposed related webhook primitives but are outside the supported range.

## Purpose

Mastra can already export traces to Latitude through OTLP. This integration closes the other half of the loop:

```text
Mastra agent run
  -> OTLP traces in Latitude
  -> Latitude discovers a signal or opens an incident
  -> Agent Dispatch sends a signed webhook
  -> @latitude-data/mastra verifies and routes the webhook
  -> Mastra wakes the subscribed agent thread
  -> the agent investigates with Latitude MCP
```

The package is receiver-side glue. Latitude remains responsible for deciding when to dispatch, applying mute and guardrail policy, assembling investigation context, signing deliveries, and retrying transport failures.

## Goals

- Register a Latitude provider in `Agent({ signals: [...] })`.
- Verify the existing `X-Latitude-Signature` against the raw request body.
- Route each dispatch to every Mastra thread watching the Latitude project.
- Produce urgent or high-priority notifications that the agent's Mastra delivery policy sends immediately.
- Give the model the rendered Latitude investigation prompt.
- Preserve the structured dispatch context for tools and application code.
- Deduplicate retries per target thread.
- Support durable subscriptions and multiple Mastra server replicas through storage ports.
- Use Web Standard APIs in the package core.
- Document a complete setup that covers OTLP, Agent Dispatch, Mastra storage, and Latitude MCP.

## Non-goals

- A new Latitude `mastra` integration kind or adapter.
- A new webhook body or versioned event API.
- Polling Latitude's signals, incidents, or monitors.
- Provisioning Latitude MCP credentials in the webhook or package.
- Running a Mastra agent inside Latitude.
- Tracking the agent run, resulting pull request, or remediation outcome.
- Managing Mastra thread creation on behalf of the customer's application.
- Shipping a Redis or Postgres client as a package dependency.
- Replacing Mastra's own notification inbox or delivery policy.

## Existing contracts

### Latitude delivery

The shipped webhook adapter sends:

```http
POST <configured public HTTPS URL>
Content-Type: application/json
X-Latitude-Signature: sha256=<HMAC-SHA256(secret, raw body)>
X-Latitude-Delivery: <dispatch idempotency key>
```

```json
{
  "trigger": "incident.opened",
  "context": {
    "trigger": "incident.opened",
    "organizationName": "Acme Inc.",
    "projectName": "Checkout API",
    "projectSlug": "checkout-api",
    "deepLinkUrl": "https://app.latitude.so/projects/checkout-api/signals/payment-timeouts",
    "signal": {
      "id": "sig_123",
      "slug": "payment-timeouts",
      "name": "Payment timeout spike",
      "source": "flagger",
      "priority": "high"
    },
    "incident": {
      "id": "inc_123",
      "severity": "high"
    },
    "sampleTraceIds": ["trace_123"]
  },
  "prompt": "Investigate the Latitude signal..."
}
```

The adapter lives in `packages/platform/agent-dispatch/src/adapters/webhook-adapter.ts`. The body schema lives in `packages/domain/agent-dispatch/src/entities/agent-dispatch-context.ts`.

Automatic triggers are:

- `signal.discovered`
- `incident.opened`
- `monitor.incident`

Manual sends use `manual`.

Latitude retries `429`, `5xx`, and transport failures. It treats other `4xx` responses as configuration or authentication failures. `X-Latitude-Delivery` is stable across transport retries.

### Mastra delivery

A Mastra signal provider:

- Extends `SignalProvider`.
- Uses `subscribe()` and `unsubscribe()` to maintain watched resources.
- Receives webhooks through an application-owned HTTP route.
- Calls `notify()` for matched subscriptions.
- Requires Mastra storage with notification support.
- Keeps subscriptions in process memory unless the provider persists and restores them.

The agent connects and starts providers passed through its `signals` array.

## Decisions

### D1. Use the generic Agent Dispatch webhook

The package consumes the webhook adapter that already ships. A named Mastra adapter would duplicate the same outbound HTTP behavior and create another integration credential/config path.

The Latitude UI may link to the Mastra setup guide from the webhook integration. The stored integration kind remains `webhook`.

### D2. Publish `@latitude-data/mastra`

The package name is broad enough to hold signal delivery now and optional Mastra-specific observability helpers later. It should live at:

```text
packages/integrations/mastra/
```

This is a customer runtime integration, not a telemetry exporter. Placing it under `packages/telemetry` would make ownership unclear because the first release consumes Agent Dispatch and does not emit telemetry.

The initial version is `0.1.0`. The package is MIT licensed and published from `development` using the repository's existing npm publish action.

### D3. Route by Latitude project

The external resource ID is:

```text
latitude:project:<projectSlug>
```

Project routing matches the current configuration model: dispatch is configured per Latitude project, and a reliability agent usually owns one thread per project or repository.

Signal-level routing is not part of the first release. A newly discovered signal cannot have a pre-existing subscription, so signal IDs are a poor default routing key.

One provider instance and webhook route serve one Latitude organization. The existing payload contains `organizationName` but no stable organization ID, and the signing secret belongs to one organization-scoped integration. A shared endpoint for several Latitude organizations must mount one provider instance per organization at distinct paths.

Project slugs only need to be unique inside that provider instance. This constraint prevents two organizations with the same project slug from sharing subscriptions accidentally.

### D4. Verify before parsing

The provider receives the raw request bytes, verifies the signature, then decodes and parses JSON. It must never parse and reserialize the body before verification.

The package uses Web Crypto HMAC verification and `Request.arrayBuffer()`. It does not import `node:crypto`.

### D5. Put the rendered prompt in the notification summary

Mastra presents the notification `summary` to the model. Storing the Latitude prompt only in `payload` would wake the agent with a short label but hide the investigation instructions.

If `prompt` is empty, the package builds a fallback summary from the trigger, project name, signal or monitor name, and deep link. An empty custom prompt template must not make an otherwise valid dispatch fail.

The default notification is:

```ts
{
  source: "latitude",
  kind: payload.trigger,
  priority: priorityForTrigger(payload.trigger),
  summary: payload.prompt,
  payload: {
    deliveryId,
    trigger: payload.trigger,
    context: payload.context,
  },
  dedupeKey: deliveryId,
  attributes: {
    projectSlug: payload.context.projectSlug,
    trigger: payload.trigger,
  },
  metadata: {
    deliveryId,
    deepLinkUrl: payload.context.deepLinkUrl,
  },
}
```

Default priorities:

| Trigger | Mastra priority |
| --- | --- |
| `incident.opened` | `urgent` |
| `monitor.incident` | `urgent` |
| `manual` | `urgent` |
| `signal.discovered` | `high` |

Applications may override the notification builder.

The provider does not choose whether an active or idle thread receives, queues, summarizes, or discards a notification. Mastra's `Agent.notifications.deliveryPolicy` owns that decision. The setup guide configures `urgent` and `high` priorities as `deliver` so the default trigger mapping wakes idle threads and reaches active threads immediately.

### D6. Deduplicate per target thread

Latitude can retry after the receiver has already notified some threads. Deduplication therefore uses:

```text
<providerId>:<deliveryId>:<mastraResourceId>:<threadId>
```

A request-level claim is insufficient because one project can fan out to several threads and only some notifications may fail.

Mastra's `dedupeKey` remains a second layer, but the package does not rely on it for cross-process exclusion.

### D7. Keep storage bring-your-own

The package defines storage ports and ships in-memory implementations for local development and single-process deployments. Production applications with more than one replica must provide shared implementations.

The package does not add a Redis or database SDK dependency. This keeps infrastructure replaceable and avoids choosing a customer's storage stack.

When `NODE_ENV=production`, the provider emits a safe configuration event if either store is absent. It does not inspect deployment topology or refuse to start.

### D8. The webhook route opts out of Mastra auth

Mastra custom API routes require authentication when server auth is configured. Latitude does not have the customer's Mastra bearer token.

The route sets `requiresAuth: false`. HMAC verification is the route's authentication mechanism.

### D9. Use a custom provider instead of `WebhookSignalProvider`

Mastra's `WebhookSignalProvider` accepts a parsed body and handles resource matching. It does not verify Latitude's raw-body HMAC, provide per-target delivery leases, or persist subscriptions.

`LatitudeSignalProvider` extends `SignalProvider` directly so one component owns verification, validation, matching, deduplication, and notification mapping. A middleware wrapped around `WebhookSignalProvider` would still need a second component for delivery claims and subscription persistence.

## Package structure

```text
packages/integrations/mastra/
  CHANGELOG.md
  README.md
  package.json
  tsconfig.json
  tsdown.config.ts
  src/
    index.ts
    provider.ts
    schemas.ts
    signature.ts
    resource-id.ts
    notification.ts
    errors.ts
    stores.ts
    memory-stores.ts
    provider.test.ts
    signature.test.ts
    contract.test.ts
```

Build conventions:

- ESM package, targeting Node 20.
- `tsdown` build.
- `tsgo -p tsconfig.json --noEmit` typecheck.
- Biome check and formatting.
- Vitest tests under `src`.
- `@mastra/core` is a peer dependency and a dev dependency.
- `zod` is the only proposed runtime dependency.
- `@mastra/core` is never bundled.

Proposed package metadata:

```json
{
  "name": "@latitude-data/mastra",
  "version": "0.1.0",
  "description": "Connect Mastra agent threads to Latitude signals and incidents",
  "license": "MIT",
  "type": "module",
  "files": ["dist"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@mastra/core": ">=1.42.0 <2"
  }
}
```

Before adding dependencies, implementation must confirm the current Mastra and Zod licenses and inspect all new transitive packages. Peer dependencies must not be bundled.

## Public API

### Provider construction

```ts
import {
  InMemoryLatitudeDeliveryStore,
  LatitudeSignalProvider,
} from "@latitude-data/mastra"

const latitudeSignals = new LatitudeSignalProvider({
  secret: process.env.LATITUDE_WEBHOOK_SECRET!,
  deliveryStore: new InMemoryLatitudeDeliveryStore(),
})
```

```ts
export type LatitudeSignalProviderOptions = {
  readonly secret: string | (() => string | Promise<string>)
  readonly deliveryStore?: LatitudeDeliveryStore
  readonly subscriptionStore?: LatitudeSubscriptionStore
  readonly maxBodyBytes?: number
  readonly deliveryLeaseMs?: number
  readonly completedDeliveryTtlMs?: number
  readonly buildNotification?: LatitudeNotificationBuilder
  readonly onEvent?: (event: LatitudeProviderEvent) => void | Promise<void>
}
```

Defaults:

| Option | Default |
| --- | --- |
| `maxBodyBytes` | 1 MiB |
| `deliveryLeaseMs` | 5 minutes |
| `completedDeliveryTtlMs` | 7 days |
| `deliveryStore` | in-memory, with a production warning |
| `subscriptionStore` | none, with a production warning |

`secret` may be an async resolver so applications can load it from their own secret manager. The resolver runs once per request. Secret values must never be included in errors, logs, provider events, or notification metadata.

### Thread subscriptions

```ts
await latitudeSignals.watchProject(
  {
    resourceId: "reliability-agent",
    threadId: "checkout-production",
  },
  "checkout-api",
  {
    triggers: ["incident.opened", "monitor.incident", "manual"],
  },
)

await latitudeSignals.unwatchProject(
  {
    resourceId: "reliability-agent",
    threadId: "checkout-production",
  },
  "checkout-api",
)
```

```ts
export type LatitudeSubscriptionMetadata = {
  readonly triggers?: readonly LatitudeDispatchTrigger[]
}

export type LatitudeWebhookResponse =
  | {
      readonly matched: number
      readonly delivered: number
      readonly deduplicated: number
    }
  | {
      readonly error:
        | "invalid_signature"
        | "missing_delivery_id"
        | "invalid_payload"
        | "payload_too_large"
        | "delivery_failed"
      readonly retryable?: boolean
    }

export class LatitudeSignalProvider extends SignalProvider<"latitude"> {
  readonly id = "latitude" as const

  watchProject(
    target: SignalProviderTarget,
    projectSlug: string,
    metadata?: LatitudeSubscriptionMetadata,
  ): Promise<SignalSubscription>

  unwatchProject(
    target: SignalProviderTarget,
    projectSlug: string,
  ): Promise<boolean>

  handleRequest(request: Request): Promise<Response>

  handleWebhook(
    request: SignalProviderWebhookRequest,
  ): Promise<{ status: number; body: LatitudeWebhookResponse }>
}
```

`handleRequest()` is the preferred ingress API. It preserves raw bytes and normalizes headers from a Web Standard `Request`.

`handleWebhook()` supports Mastra's provider interface. For this provider, `request.body` must be a `string`, `Uint8Array`, or `ArrayBuffer` containing the unparsed body. Passing an object returns `400` because its original signed representation is unavailable.

`watchProject()` and `unwatchProject()` are async because a configured subscription store is write-through.

An empty `triggers` array has the same meaning as an omitted field and matches every trigger.

### Mastra registration

```ts
import { Agent } from "@mastra/core/agent"

export const reliabilityAgent = new Agent({
  id: "reliability-agent",
  name: "Reliability Agent",
  model: "openai/gpt-5",
  instructions: [
    "Investigate Latitude reliability notifications.",
    "Use Latitude MCP to inspect signals and traces when it is available.",
    "Do not mute or resolve a signal unless the user asks.",
  ].join(" "),
  signals: [latitudeSignals],
  notifications: {
    deliveryPolicy: {
      priorities: {
        urgent: "deliver",
        high: "deliver",
      },
    },
  },
})
```

The application must configure a Mastra storage adapter that supports notifications. The package does not construct Mastra storage.

Mastra controls delivery through `notifications.deliveryPolicy`; the provider only supplies the priority. Applications may use another policy, but then immediate delivery and idle-thread wake are no longer package guarantees.

A provider instance connects to one Mastra agent. An application that sends Latitude events to several agents creates one provider and route per agent, or implements an application-level router in front of those providers.

### Webhook route

```ts
import { Mastra } from "@mastra/core"
import { registerApiRoute } from "@mastra/core/server"

export const mastra = new Mastra({
  agents: { reliabilityAgent },
  storage: sharedMastraStorage,
  server: {
    apiRoutes: [
      registerApiRoute("/webhooks/latitude", {
        method: "POST",
        requiresAuth: false,
        handler: (c) => latitudeSignals.handleRequest(c.req.raw),
      }),
    ],
  },
})
```

The route must not call `c.req.json()` before `handleRequest()`.

## Wire schemas

The package validates the stable part of the dispatch contract and preserves unknown fields:

```ts
export const latitudeDispatchTriggerSchema = z.enum([
  "signal.discovered",
  "incident.opened",
  "monitor.incident",
  "manual",
])

export const latitudeDispatchContextSchema = z
  .object({
    trigger: latitudeDispatchTriggerSchema,
    organizationName: z.string(),
    projectName: z.string(),
    projectSlug: z.string(),
    deepLinkUrl: z.string(),
    signal: z
      .object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        source: z.enum(["flagger", "annotation", "custom"]),
        priority: z.string().nullable(),
      })
      .passthrough()
      .optional(),
    incident: z
      .object({
        id: z.string(),
        severity: z.string(),
      })
      .passthrough()
      .optional(),
    monitor: z
      .object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const latitudeDispatchPayloadSchema = z
  .object({
    trigger: latitudeDispatchTriggerSchema,
    context: latitudeDispatchContextSchema,
    prompt: z.string(),
  })
  .passthrough()
  .superRefine((payload, ctx) => {
    if (payload.trigger !== payload.context.trigger) {
      ctx.addIssue({
        code: "custom",
        path: ["context", "trigger"],
        message: "Context trigger does not match the dispatch trigger.",
      })
    }
  })
```

The public schema intentionally validates fewer optional context fields than the domain schema. Additive Latitude context changes should not require a package release.

A monorepo contract test parses fixtures built from `agentDispatchContextSchema` for every trigger. Production source must not import `@domain/agent-dispatch`.

## Signature verification

Processing order:

1. Reject a body larger than `maxBodyBytes` with `413`.
2. Require `X-Latitude-Signature`.
3. Require the exact `sha256=<64 lowercase or uppercase hex characters>` format.
4. Resolve the configured secret.
5. Import the UTF-8 secret into `crypto.subtle` as an HMAC SHA-256 key.
6. Verify the hex signature against the raw request bytes with `crypto.subtle.verify`.
7. Decode the verified bytes as UTF-8.
8. Parse JSON.
9. Validate the dispatch schema.
10. Require `X-Latitude-Delivery`.

Malformed signatures and mismatches return `401`. Malformed JSON, invalid schemas, and missing delivery IDs return `400`.

Latitude does not currently send a signature timestamp. The receiver cannot enforce a clock-based replay window. Completed delivery records provide replay protection for the configured TTL.

## Subscription persistence

Mastra's base provider registry is in memory. The package adds an optional store:

```ts
export type PersistedLatitudeSubscription = {
  readonly resourceId: string
  readonly threadId: string
  readonly externalResourceId: string
  readonly metadata: LatitudeSubscriptionMetadata
}

export interface LatitudeSubscriptionStore {
  list(providerId: string): Promise<readonly PersistedLatitudeSubscription[]>
  upsert(
    providerId: string,
    subscription: PersistedLatitudeSubscription,
  ): Promise<void>
  remove(
    providerId: string,
    target: SignalProviderTarget,
    externalResourceId: string,
  ): Promise<void>
}
```

Lifecycle:

- `start()` loads stored subscriptions and calls the protected base `subscribe()` for each one.
- Base subscription deduplication makes repeated `start()` calls safe.
- `watchProject()` subscribes in memory, then persists the subscription.
- If persistence fails, `watchProject()` removes the in-memory subscription and rejects.
- `unwatchProject()` removes the persisted record first, then the in-memory subscription.
- `stop()` calls `super.stop()` so Mastra stops polling and clears the in-memory registry. This provider does not poll.

Applications that configure subscriptions deterministically on every startup may omit `subscriptionStore`.

When subscription metadata omits `triggers`, the subscription matches every trigger. Trigger filtering only narrows delivery when the caller supplies a non-empty list.

## Delivery deduplication

The storage port models a leased claim:

```ts
export type LatitudeDeliveryClaim =
  | { readonly status: "acquired"; readonly token: string }
  | { readonly status: "completed" }
  | { readonly status: "in_progress" }

export interface LatitudeDeliveryStore {
  acquire(
    key: string,
    options: { readonly leaseMs: number },
  ): Promise<LatitudeDeliveryClaim>

  complete(
    key: string,
    token: string,
    options: { readonly ttlMs: number },
  ): Promise<void>

  release(key: string, token: string): Promise<void>
}
```

For each matched subscription:

1. Build the per-thread delivery key.
2. Acquire a lease.
3. Skip `completed` claims.
4. Mark `in_progress` claims as retryable.
5. Call `notify()` for acquired claims.
6. Complete the claim after the awaited `notify()` call resolves.
7. Release the claim if notification delivery throws.

`SignalProvider.notify()` resolves after Mastra's notification ingress finishes. It does not wait for the awakened agent run. The five-minute lease is intentionally much longer than a notification storage write. If a storage outage holds `notify()` beyond the lease, a retry can acquire the claim and duplicate delivery; the Mastra `dedupeKey` is a secondary mitigation for that residual race.

If any target fails or is already in progress, the endpoint returns `503`. Latitude retries the request. Targets completed by the earlier attempt are skipped on retry.

The in-memory store implements the same state machine but is safe only within one process.

## Request processing

```text
HTTP request
  -> body size check
  -> signature verification
  -> JSON and schema validation
  -> resource ID = latitude:project:<projectSlug>
  -> lookup Mastra subscriptions
  -> apply a trigger filter when subscription metadata defines one
  -> acquire one delivery claim per target
  -> map payload to notification
  -> notify target thread
  -> complete or release claims
  -> return aggregate HTTP result
```

Fan-out may run concurrently with a bounded concurrency of 10. This prevents one project with many subscriptions from creating an unbounded burst.

The package returns `200` when there are no matching subscriptions. Latitude has delivered to the configured endpoint successfully, and retrying cannot create a subscription.

Automatic dispatches retry `503` responses through the Agent Dispatch worker. Manual sends run synchronously and surface the error to the user without a background retry.

## HTTP responses

| Condition | Status | Body |
| --- | --- | --- |
| All matched threads accepted | `200` | `{ "matched": n, "delivered": n, "deduplicated": 0 }` |
| No matching project subscription | `200` | `{ "matched": 0, "delivered": 0, "deduplicated": 0 }` |
| Every target was already completed | `200` | `{ "matched": n, "delivered": 0, "deduplicated": n }` |
| Invalid or missing signature | `401` | `{ "error": "invalid_signature" }` |
| Missing delivery header | `400` | `{ "error": "missing_delivery_id" }` |
| Invalid JSON or payload | `400` | `{ "error": "invalid_payload" }` |
| Body exceeds configured limit | `413` | `{ "error": "payload_too_large" }` |
| One or more target deliveries need retry | `503` | `{ "error": "delivery_failed", "retryable": true }` |

Responses do not include exception messages, secrets, subscription metadata, thread IDs, or resource IDs.

## Errors and observability

The package exports errors with stable codes:

```ts
export type LatitudeProviderErrorCode =
  | "invalid_signature"
  | "missing_delivery_id"
  | "invalid_payload"
  | "payload_too_large"
  | "subscription_store_failed"
  | "delivery_store_failed"
  | "notification_failed"
```

`onEvent` receives safe operational events:

```ts
export type LatitudeProviderEvent =
  | {
      readonly type: "webhook.accepted"
      readonly deliveryId: string
      readonly projectSlug: string
      readonly matched: number
      readonly delivered: number
      readonly deduplicated: number
    }
  | {
      readonly type: "webhook.rejected"
      readonly code: LatitudeProviderErrorCode
      readonly deliveryId?: string
    }
  | {
      readonly type: "subscription.changed"
      readonly action: "watched" | "unwatched" | "restored"
      readonly projectSlug: string
    }
```

The package does not choose a logger or telemetry backend. Applications can map `onEvent` into their existing logger.

`onEvent` is observational. A callback failure is swallowed and must not change the webhook response or delivery claim state.

## Multi-instance behavior

| Concern | Single process | Multiple replicas |
| --- | --- | --- |
| Mastra notification storage | Persistent adapter required | Shared persistent adapter required |
| Provider subscription registry | In memory is acceptable if rebuilt at startup | Rehydrate the same shared subscriptions on every replica |
| Delivery claims | In-memory store is acceptable | Shared store is required |
| HTTP routing | Any instance | Any instance |
| Duplicate Latitude retries | Suppressed in process | Suppressed through shared delivery claims |

Each replica restores all subscriptions because the load balancer may send the webhook to any replica. A shared subscription store does not elect one active provider.

## Security

- The route is public at the HTTP layer and authenticated only by the Latitude HMAC.
- Signature verification uses raw bytes and Web Crypto.
- Invalid signatures are rejected before JSON parsing.
- The package accepts one current secret in the first release.
- Secrets never enter Mastra notifications, logs, callback events, or errors.
- The default body limit is 1 MiB.
- Notification payloads contain trace excerpts and must use the same access controls as the Mastra agent thread.
- Latitude MCP authentication remains a separate customer setup step.
- The package never receives or stores a Latitude API key.
- Delivery records prevent replay for seven days by default. A captured signed request can be replayed after its record expires because the current webhook has no signed timestamp.

Secret rotation with overlapping old and new secrets is future work because Latitude cannot rotate webhook secrets in place today.

## Latitude repository changes

### Package

- Add `packages/integrations/mastra`.
- Add package scripts and build config based on existing published integration packages.
- Add `.github/workflows/publish-mastra-integration.yml` using `.github/actions/publish-npm-package`.
- Add the package to `.github/workflows/publish-packages.yml`.
- Add package download tracking if the npm badge workflow remains the repository convention.
- Add a `knip.json` workspace entry.

### Public documentation

Add `docs/agent-dispatch/mastra.mdx` with:

1. Install `@latitude-data/mastra` and a compatible `@mastra/core`.
2. Configure persistent Mastra notification storage.
3. Construct and register `LatitudeSignalProvider`.
4. Configure Mastra's notification delivery policy for `urgent` and `high`.
5. Create or initialize the target memory thread.
6. Call `watchProject()`.
7. Mount `/webhooks/latitude` with `requiresAuth: false`.
8. Configure the URL and trigger selection in Latitude's webhook integration.
9. Store the webhook secret.
10. Connect Latitude MCP to the agent.
11. Export Mastra telemetry to Latitude through the existing OTLP guide.

Cross-link this page from:

- `docs/agent-dispatch/webhooks.mdx`
- `docs/telemetry/frameworks/mastra.mdx`
- the relevant `docs/docs.json` navigation group

The existing raw webhook documentation must fix its signature example before the package launches: `timingSafeEqual` throws when the two buffers have different lengths. The example must validate the header format and equal lengths first.

### Product UI

The first release needs no new integration kind. Add a short Mastra link to the webhook connect/manage view only if the UI has an established pattern for framework-specific setup links.

Do not add Mastra-specific fields to `agent_dispatch_configs.target`.

### Backend

No backend change is required for launch.

Two existing webhook concerns should be tracked separately:

- The UI says the webhook secret is shown once, but `getWebhookSecret` can decrypt and return it later.
- Webhook secret rotation and timestamp-based replay protection do not exist.

Neither concern should block the provider because it can securely consume the current contract.

## Test plan

### Package unit tests

Signature verification:

- Accept the same fixed HMAC vector as the outbound adapter test.
- Reject a missing header.
- Reject a malformed prefix or hex digest.
- Reject a wrong-length digest without throwing an unhandled error.
- Reject a valid signature for a modified body.
- Verify UTF-8 payloads against their original bytes.
- Confirm JSON whitespace changes invalidate the signature.

Payload validation:

- Parse each automatic trigger and `manual`.
- Reject mismatched top-level and context triggers.
- Accept additive unknown context fields.
- Reject a missing project slug, deep link, or prompt field.
- Build a useful fallback summary for an empty prompt.
- Reject bodies over the configured limit.

Routing and notification mapping:

- Format project resource IDs consistently.
- Fan out to all subscriptions for one project.
- Do not notify subscriptions for another project.
- Apply per-subscription trigger filters.
- Match all triggers when subscription metadata omits `triggers`.
- Put the complete prompt in `summary`.
- Put structured context in `payload`.
- Map priorities by trigger.
- Verify the documented agent delivery policy immediately delivers `urgent` and `high` notifications.

Deduplication:

- Deliver the first request once per thread.
- Skip completed per-thread claims on retry.
- Release a claim after notification failure.
- Return `503` after a partial fan-out failure.
- Retry only incomplete targets on the next request.
- Treat concurrent in-progress claims as retryable.
- Document and test lease expiry during a delayed notification.
- Allow a different `X-Latitude-Delivery` for a manual resend.

Subscription persistence:

- Restore subscriptions in `start()`.
- Avoid duplicate subscriptions on repeated restoration.
- Roll back the in-memory watch when persistence fails.
- Remove persistent and in-memory records on unwatch.
- Clear only in-memory state on stop.

HTTP handling:

- Read a Web Standard `Request` without prior parsing.
- Return the specified status and safe body for every error class.
- Return `200` with zero matches.
- Never include the secret in an event or error.

### Monorepo contract tests

- Build one payload fixture for each trigger from `agentDispatchContextSchema`.
- Parse every fixture with the public package schema.
- Sign each fixture through `createWebhookAdapter` and verify it through the package.
- Assert that `X-Latitude-Delivery` becomes the Mastra notification `dedupeKey`.

The outbound adapter may use a mocked HTTP boundary. Repository behavior continues to use in-memory database adapters where applicable.

### Documentation verification

- Run the example against a minimal Mastra application.
- Confirm the route works when Mastra JWT auth is enabled and `requiresAuth: false`.
- Confirm `c.req.json()` is not called before verification.
- Start a thread, subscribe it, send a signed fixture, and observe one stored notification.
- Confirm the documented delivery policy wakes an idle thread with the full prompt.
- Confirm the same policy delivers to an active thread.
- Repeat the same delivery ID and observe no second wake.

## Compatibility and release policy

- Minimum supported Mastra version: `1.42.0`.
- Peer range: `>=1.42.0 <2`.
- CI tests the minimum supported version and the latest available `1.x`.
- Because signal providers are beta, a Mastra minor release may break the package.
- A scheduled or manually triggered compatibility job should test the latest Mastra release.
- Package releases use independent semantic versioning and a package-specific changelog.
- The package stays pre-`1.0` until the Mastra signal provider API is stable and the storage ports have production usage.

## Resolved implementation choices

- Create the new `packages/integrations` family because this package consumes Agent Dispatch and is not a telemetry exporter.
- Match every trigger when subscription metadata has no trigger filter. Latitude's trigger selection UI remains the primary volume control.
- Publish the first implementation as `@latitude-data/mastra@0.1.0` rather than maintaining a copy-paste example as the supported interface.
- Support one Latitude organization and one Mastra agent per provider instance and route.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1: package foundation

- [ ] **P1-1**: Create `packages/integrations/mastra` with package metadata, ESM build, typecheck, Biome, and Vitest scripts.
- [ ] **P1-2**: Add permissive-license audit notes for Mastra, Zod, and new transitives.
- [ ] **P1-3**: Implement tolerant dispatch schemas, public types, project resource IDs, and stable errors.
- [ ] **P1-4**: Implement raw-byte Web Crypto signature verification and the framework-neutral `handleRequest(Request)` boundary.
- [ ] **P1-5**: Implement notification mapping with full-prompt summary, structured payload, priority mapping, and an empty-prompt fallback.
- [ ] **P1-6**: Implement `LatitudeSignalProvider`, `watchProject()`, `unwatchProject()`, and lifecycle behavior.
- [ ] **P1-7**: Implement delivery and subscription storage ports plus in-memory adapters.
- [ ] **P1-8**: Add unit and contract tests.

**Exit gate**:

- A signed Latitude fixture wakes one subscribed Mastra thread.
- A repeated delivery ID does not wake it again.
- A tampered body returns `401`.
- An omitted subscription trigger filter matches every trigger.
- A partial fan-out failure returns `503`; the retry delivers only incomplete targets.
- A configured subscription store restores watches after provider restart.
- No Latitude backend or payload change is required.

### Phase 2: production documentation and release

- [ ] **P2-1**: Add the Mastra Agent Dispatch guide and navigation.
- [ ] **P2-2**: Cross-link OTLP telemetry, webhooks, MCP, and the new provider.
- [ ] **P2-3**: Fix the unsafe unequal-length `timingSafeEqual` example in the raw webhook guide.
- [ ] **P2-4**: Add a runnable minimal Mastra example with persistent notification storage.
- [ ] **P2-5**: Add npm publish, compatibility, and download-tracking workflows.
- [ ] **P2-6**: Publish `@latitude-data/mastra@0.1.0`.

**Exit gate**:

- A user can follow the public guide from a new Mastra app to a verified webhook, persistent subscription, and successful idle-thread wake.
- CI tests the minimum and latest supported Mastra `1.x` versions.

### Phase 3: optional hardening

- [ ] **P3-1**: Add an official shared-store adapter only when production users converge on a storage backend.
- [ ] **P3-2**: Add webhook secret rotation with an overlap window after Latitude supports backend rotation.
- [ ] **P3-3**: Add `X-Latitude-Timestamp` and replay-window verification in a version-compatible wire change.
- [ ] **P3-4**: Evaluate a branded Mastra integration tile after usage shows that generic webhook setup hurts activation.
- [ ] **P3-5**: Evaluate signal-level thread routing after customers demonstrate a need for one thread per signal.

**Exit gate**:

- Hardening work is driven by observed deployment failures or activation friction, not added to the first release speculatively.
