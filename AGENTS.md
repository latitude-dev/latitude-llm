# Agent Guidelines for Latitude LLM

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Required Skills

Before writing any code, load the `coding-standards` skill (`/coding-standards`). This skill contains essential principles for writing maintainable code.

## Build/Test Commands

- `pnpm --filter @latitude-data/core db:generate` - Generate database migrations
- `pnpm --filter @latitude-data/core db:migrate` - Run database migrations
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm prettier` - Format code
- `pnpm tc` - Type check all packages
- `pnpm test` - Run all tests. NEVER run this command against the whole repo, only against packages you are working on, and one at a time, otherwise the host machine will run out of memory.

## Code Style

- Use TypeScript for all code, prefer types over interfaces
- Prettier config: single quotes, no semicolons, trailing commas
- Functional programming patterns, early returns for readability
- Named exports preferred, descriptive names with auxiliary verbs (isLoading, hasError)
- Event handlers prefixed with "handle" (handleClick, handleSubmit)
- Directories use lowercase with dashes (auth-wizard)
- Avoid enums, use const maps or type unions instead
- Exports go top of file, internal methods at the bottom
- Always use packages/core's captureException method rather than logging errors with console.error
- **DO NOT** add comments unless they are JSDocs or you are explicitely asked to.
- Use JSDoc comments for exported functions and classes. You can skip
  JSDocs for internal functions that are simple and self-explanatory.

## Architecture

- Monorepo with pnpm workspaces and Turborepo
- Core business logic in `packages/core`, UI components in `packages/web-ui`
- Services return Result abstraction for error handling
- Database operations use Transaction abstraction
- models are in `packages/core`
- Write operations receive optional `transaction` parameter defaulting to `new Transaction()`
- Write services receive model instances, not IDs

## Testing

Before writing tests, load the `testing` skill (`/testing`) for detailed patterns and guidelines.

## CRUD Operations Pattern

### Service Layer (`packages/core/src/services/`)

- Create services in dedicated folders (e.g., `apiKeys/`, `providerApiKeys/`)
- Each service exports functions that accept model instances and optional `instance` parameter
- Services use Transaction abstraction and return Result objects
- Always use named exports
- Avoid exporting all services from an `index.ts` barrel file
- Example structure:

  ```
  services/apiKeys/
    ├── create.ts
    ├── destroy.ts
    ├── update.ts
  ```

### Action Layer (`apps/web/src/actions/`)

- Server actions use `authProcedure` pattern
- Input validation with Zod schemas
- Actions fetch model instances using scoped queries before calling services
- **Admin-only actions**: Place under `actions/admin/` directory for backoffice functionality
- Example pattern:

  ```typescript
  export const updateApiKeyAction = authProcedure
    .inputSchema(z.object({ id: z.number(), name: z.string() }))
    .action(async ({ parsedInput, ctx }) => {
      const repo = new Repository(ctx.workspace.id)
      const model = await repo.find(parsedInput.id).then((r) => r.unwrap())
      return updateService(model, { name: parsedInput.name }).then((r) =>
        r.unwrap(),
      )
    })
  ```

- For writing an action with a different scope. Let's say withing projects:

  ```typescript
  import { withProject, withProjectSchema } from '../../procedures'
  export const updateProjectAction = withProject
    .inputSchema(withProjectSchema.extend({ id: z.number(), name: z.string() }))
    .action(async ({ parsedInput, ctx }) => {
      const repo = new ProjectRepository(ctx.workspace.id)
      const model = await repo.find(parsedInput.id).then((r) => r.unwrap())
      return updateProjectService(model, { name: parsedInput.name }).then((r) =>
        r.unwrap(),
      )
    })
  ```

  `withProject` procedure inherits from `authProcedure` and adds project validation.

### Store Layer (`apps/web/src/stores/`)

- Use SWR for data fetching with custom hooks
- Implement optimistic updates in action success handlers
- Export CRUD operations: `create`, `destroy`, `update` with loading states
- Toast notifications on success/error
- Example pattern:

  ```typescript
  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updateAction,
    {
      onSuccess: async ({ data: updated }) => {
        toast({ title: 'Success', description: 'Updated successfully' })
        mutate(data.map((item) => (item.id === updated.id ? updated : item)))
      },
    },
  )
  ```

### UI Patterns

- Use modal-based editing for updates (not inline editing)
- Follow existing modal patterns from destroy operations
- Add routes to `services/routes.ts` for new modal pages
- Modal pages in `app/(private)/path/[id]/action/page.tsx` structure
- Action buttons in table cells with tooltips
- Use consistent icon patterns: `edit` for updates, `trash` for deletes

## Database Schema Patterns

### PostgreSQL (Drizzle ORM)

#### Schema Definition (`packages/core/src/schema/models/`)

- Use Drizzle ORM with PostgreSQL schema
- All tables use `latitudeSchema.table()` from `../db-schema`
- Include timestamps with `...timestamps()` helper
- Use `bigserial` for primary keys with `{ mode: 'number' }`
- Foreign keys use `references()` with cascade delete where appropriate
- Example pattern:

  ```typescript
  export const tableName = latitudeSchema.table('table_name', {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ...timestamps(),
  })
  ```

### Destructive Database Migrations

Destructive database migrations (dropping tables, columns, or other schema elements) are NOT backwards compatible with currently-deployed code and must be performed in **two separate PRs**:

**PR 1 - Code Changes (deploy first):**

1. Remove all code references to the database entities being dropped
2. Update Drizzle schema files to remove column/table definitions
3. Update repositories, services, factories, and tests
4. The old columns/tables remain in the database but are simply unused

**PR 2 - Database Migration (deploy after PR 1 is live):**

1. Generate the Drizzle migration: `pnpm --filter @latitude-data/core db:generate --name drop_unused_tables`
2. This creates a migration file to drop the unused columns/tables
3. Run the migration: `pnpm --filter @latitude-data/core db:migrate`

**Why this approach?**

- If you deploy a migration that drops columns/tables while old code is still running, the old code will crash trying to access non-existent schema
- By removing code references first, the deployed application no longer needs those columns
- Once the new code is running everywhere, the destructive migration can safely be applied

**Example: Removing a feature with database tables**

```
# PR 1: Remove code
- Delete services, actions, UI components
- Remove columns from Drizzle schema files
- Update event handlers and jobs
- Remove from constants and configuration

# PR 2: Database cleanup (after PR 1 is deployed)
- pnpm --filter @latitude-data/core db:generate
- Review the generated migration
- pnpm --filter @latitude-data/core db:migrate
```

### SCOPED QUERIES

NOTE: WE ARE CURRENTLY MIGRATING ALL REPOSITORIES TO SCOPED QUERIES.

All database read operations are executed via scoped queries. Scoped queries are defined in `packages/core/src/repositories/queries.ts` and are scoped to a workspace. In the queries folder you can also declare unscoped queries that are used in cases where tenancy checks aren't required.

### Repository Pattern (`packages/core/src/repositories/`)

NOTE: THIS PATTERN IS DEPRECATED AND YOU SHOULD NOT USE IT. USE SCOPED QUERIES INSTEAD.

- For workspace-scoped entities: extend `RepositoryLegacy<T, U>`
- For global entities: create standalone repository classes
- Use `getTableColumns()` for type-safe column selection
- Implement `scope` getter for base query with workspace filtering
- Export from `packages/core/src/repositories/index.ts`
- Example pattern:

  ```typescript
  export class EntityRepository extends RepositoryLegacy<typeof tt, Entity> {
    get scope() {
      return this.db
        .select(tt)
        .from(tableName)
        .where(eq(tableName.workspaceId, this.workspaceId))
        .as('entityScope')
    }
  }
  ```

### ClickHouse Migrations (`packages/core/clickhouse/`)

ClickHouse is used for analytics and high-performance data storage. Migrations use [golang-migrate](https://github.com/golang-migrate/migrate).

#### Migration Commands

- `pnpm --filter @latitude-data/core ch:connect` - Open interactive ClickHouse client
- `pnpm --filter @latitude-data/core ch:status` - Show migration status
- `pnpm --filter @latitude-data/core ch:create <name>` - Create new migration files
- `pnpm --filter @latitude-data/core ch:up` - Apply pending migrations
- `pnpm --filter @latitude-data/core ch:down [N|all]` - Rollback N migrations (default: 1) or all
- `pnpm --filter @latitude-data/core ch:drop` - Drop all tables
- `pnpm --filter @latitude-data/core ch:reset` - Reset database (down + up)
- `pnpm --filter @latitude-data/core ch:status:test` - Show test database migration status
- `pnpm --filter @latitude-data/core ch:up:test` - Apply migrations to test database
- `pnpm --filter @latitude-data/core ch:down:test [N|all]` - Rollback test database
- `pnpm --filter @latitude-data/core ch:reset:test` - Reset test database

#### Two Migration Folders

Migrations exist in two versions to support different deployment modes:

- `clickhouse/migrations/unclustered/` - For single-node setups (development, self-hosted)
- `clickhouse/migrations/clustered/` - For replicated cluster setups (production)

The system automatically selects based on `CLICKHOUSE_CLUSTER_ENABLED` environment variable.

#### Migration File Naming

Files follow the convention: `NNNN_description.{up,down}.sql`

Example:

```
0001_create_events.up.sql
0001_create_events.down.sql
```

#### Writing Migrations

**Always create both clustered and unclustered versions.** They must be kept in sync.

Unclustered example (`unclustered/0001_create_events.up.sql`):

```sql
CREATE TABLE events (
    id String,
    workspace_id UInt64,
    timestamp DateTime64(3)
) ENGINE = ReplacingMergeTree()
ORDER BY (workspace_id, timestamp, id);
```

Clustered example (`clustered/0001_create_events.up.sql`):

```sql
CREATE TABLE events ON CLUSTER default (
    id String,
    workspace_id UInt64,
    timestamp DateTime64(3)
) ENGINE = ReplicatedReplacingMergeTree()
ORDER BY (workspace_id, timestamp, id);
```

#### Key Differences

| Aspect     | Unclustered                       | Clustered                                             |
| ---------- | --------------------------------- | ----------------------------------------------------- |
| DDL clause | None                              | `ON CLUSTER default`                                  |
| Engine     | `MergeTree`, `ReplacingMergeTree` | `ReplicatedMergeTree`, `ReplicatedReplacingMergeTree` |
| Use case   | Dev, self-hosted single-node      | Production HA                                         |

#### Migration Rules

- **Always create both versions**: Every migration needs clustered and unclustered variants
- **Keep them in sync**: Logic must be identical, only syntax differs
- **Make migrations reversible**: Always provide a working `down.sql`
- **Use `ReplacingMergeTree`** for tables that need upsert semantics
- **Include `workspace_id`** in queries for tenant isolation

## API Routes Pattern (`apps/web/src/app/api/`)

### Route Structure

- Create directory matching endpoint name
- Use `route.ts` for HTTP handlers
- Import handlers from `$/middlewares/authHandler` and `$/middlewares/errorHandler`
- Add routes to `apps/web/src/services/routes/api.ts`

### Authentication & Error Handling

- Wrap handlers with `errorHandler(authHandler(...))` for protected routes
- Use `errorHandler(...)` only for public routes
- Access workspace via `ctx.workspace` in authenticated handlers
- Example pattern:

  ```typescript
  export const GET = errorHandler(
    authHandler(
      async (_: NextRequest, { workspace }: { workspace: Workspace }) => {
        const repo = new Repository(workspace.id)
        const data = await repo.findAll().then((r) => r.unwrap())
        return NextResponse.json(data, { status: 200 })
      },
    ),
  )
  ```

## Jobs Pattern (`packages/core/src/jobs/`)

BullMQ jobs handle background processing tasks like exports, evaluations, and document runs.

### Return Values

- Jobs should return `undefined` on success whenever possible
- Avoid returning data from jobs unless the return value is explicitly needed by the caller
- This keeps job results lightweight and prevents unnecessary data serialization

### Job Configuration

- Use `removeOnComplete: true` to clean up successful jobs
- Use `removeOnFail: false` to retain failed jobs for debugging
- Configure appropriate retry attempts and backoff strategies

## Backoffice/Admin Patterns

### Navigation Setup

- Add new routes to `BackofficeRoutes` enum in `services/routes.ts`
- Add corresponding route object to `ROUTES.backoffice`
- Update `BackofficeTabs` component to include new tab
- Backoffice pages require admin user authentication

### Page Structure

- Create pages in `app/(admin)/backoffice/[section]/page.tsx`
- Use consistent layout with `Text.H1` for titles and `Text.H4` for descriptions
- Organize components in `_components/` subdirectory
- **NEVER use barrel exports** (`index.ts`) - import components directly from their files

### Component Patterns

- Import UI components from `@latitude-data/web-ui/atoms/` (not molecules)
- Use `Modal` from atoms, not molecules
- Use `TextArea` not `Textarea`
- Button sizes: `size='small'` not `size='sm'`
- Table components: `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`
- **Use `useLatitudeAction` hook** for server action calls instead of raw `fetch()`
- **Use server actions** instead of API routes for **write operations** (POST, PUT, DELETE)
- **Use API routes** with `useFetcher` + SWR for **read operations** (GET)

## Feature Implementation Checklist

When implementing new features, follow this order:

1. **Database Schema**: Create tables, generate migration
2. **Services**: Implement business logic with Result pattern
3. **Queries**: Queries are the read data layer with the db
4. **Actions**: Create server actions with validation (use `actions/admin/` for backoffice features)
5. **API Routes**: Expose endpoints with proper auth
6. **Stores**: Create SWR hooks with optimistic updates
7. **UI Components**: Build interface following design patterns
8. **Routes**: Add navigation and routing

## Action Organization Patterns

### Regular Actions (`apps/web/src/actions/`)

- User-facing functionality
- Workspace-scoped operations
- Public API endpoints

### Admin Actions (`apps/web/src/actions/admin/`)

- Backoffice/admin-only functionality
- Global system management
- Cross-workspace operations
- Examples: feature management, user administration, system configuration

### Import Path Examples

```typescript
// Regular action
import { updateApiKeyAction } from '$/actions/apiKeys/update'

// Admin action
import { createFeatureAction } from '$/actions/admin/features/create'
```

## SDK Release Process

### TypeScript SDK (`packages/sdks/typescript/`)

**IMPORTANT**: When making changes to the TypeScript SDK, you MUST:

1. Update the version in `package.json` (follow semver: patch for fixes, minor for features, major for breaking changes)
2. Update `CHANGELOG.md` with the new version and description of changes
3. These updates trigger the CI/CD pipeline to publish the new version

The TypeScript SDK is automatically published to npm and GitHub releases via `.github/workflows/publish-typescript-sdk.yml`:

1. **Manual Changelog**: Update `CHANGELOG.md` with release notes for the new version
2. **Version Bump**: Update version in `package.json`
3. **Push to Main**: Workflow automatically:
   - Builds and tests the package
   - Publishes to npm if version is new
   - Extracts changelog content for the version
   - Creates GitHub release with changelog as release notes
   - Tags release as `typescript-sdk-VERSION`

### Changelog Format

- Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format
- Use sections: Added, Changed, Deprecated, Removed, Fixed, Security
- See `CHANGELOG_TEMPLATE.md` for detailed instructions
- Workflow extracts content between `## [VERSION]` headers

### Release Detection

- Workflow compares `package.json` version with published npm version
- Only publishes if versions differ
- Supports prerelease detection (beta, alpha, rc) for GitHub release flags

## Job Patterns (`packages/core/src/jobs/`)

### Job Structure

Jobs are BullMQ workers that process background tasks. They should follow these patterns:

1. **Never return `Result.error`**: Jobs should not use the Result pattern for error handling
2. **Throw for retryable errors**: Unhandled exceptions trigger automatic retries via BullMQ
3. **Use `captureException` for non-retryable errors**: Log errors that shouldn't cause a retry
4. **Return void or undefined**: Jobs don't need to return values

### Error Handling Patterns

```typescript
// CORRECT: Throw for retryable errors (job will be retried)
export async function myJob(_: Job<MyJobData>) {
  const result = await someOperation()
  if (result.error) {
    throw result.error // Will trigger retry
  }
}

// CORRECT: Capture non-retryable errors and continue
export async function myJob(_: Job<MyJobData>) {
  const results = await Promise.all(items.map(processItem))
  const errors = results.filter((r) => r.error)
  errors.forEach((r) => captureException(r.error))
  // Job continues/completes despite individual item failures
}

// INCORRECT: Never return Result objects from jobs
export async function myJob(_: Job<MyJobData>) {
  try {
    await someOperation()
    return Result.nil() // DON'T DO THIS
  } catch (error) {
    return captureException(error) // DON'T DO THIS
  }
}
```

### Job Registration

Jobs are registered in `packages/core/src/jobs/index.ts` and scheduled via BullMQ queues.

## Event System Patterns

### Event Declaration (`packages/core/src/events/events.d.ts`)

Events in Latitude follow a structured type-safe pattern:

1. **Add Event Name**: Add new event name to the `Events` union type
2. **Create Event Type**: Define event using `LatitudeEventGeneric<EventName, DataStructure>`
3. **Add to Union**: Include in the main `LatitudeEvent` union type
4. **Handler Interface**: Add handler to `IEventsHandlers` interface (optional for pub/sub events)

Example pattern:

```typescript
// 1. Add to Events union
export type Events = 'existingEvent' | 'myNewEvent' // Add here

// 2. Define event type
export type MyNewEvent = LatitudeEventGeneric<
  'myNewEvent',
  {
    workspaceId: number
    userId: string
    customData: Record<string, unknown>
  }
>

// 3. Add to LatitudeEvent union
export type LatitudeEvent = ExistingEvent | MyNewEvent // Add here

// 4. Add handler interface (if needed)
export interface IEventsHandlers {
  existingEvent: EventHandler<ExistingEvent>[]
  myNewEvent: EventHandler<MyNewEvent>[] // Add here
}
```

### Event Publishing (`packages/core/src/events/publisher.ts`)

Use the publisher service to emit events:

```typescript
import { publisher } from '../../../events/publisher'

// For system events (analytics, webhooks, database storage)
publisher.publishLater({
  type: 'myNewEvent',
  data: {
    workspaceId: 123,
    userId: 'user-id',
    customData: { key: 'value' },
  },
})

// For real-time pub/sub events
publisher.publish('realTimeEvent', { data: 'value' })
```

## Prompt Running Architecture

The prompt running system handles executing AI prompts against LLM providers. It supports both foreground (streaming) and background (queued) execution modes.

### High-Level Flow

```
API Request → Gateway Handler → runDocumentAtCommit → ChainStreamManager → AI Provider → Response
                    ↓                                          ↓
            (background mode)                          Telemetry (spans/traces)
                    ↓                                          ↓
              enqueueRun → BullMQ Job                   Event Handlers
                                                              ↓
                                                    Live Evaluations (if enabled)
```

### Entry Points

#### Gateway API (`apps/gateway/src/routes/api/v3/projects/versions/documents/run/`)

The main entry point is `run.handler.ts` which:

1. Validates request parameters (path, parameters, tools, stream mode)
2. Fetches document, commit, and project using `getData()`
3. Publishes a `documentRunRequested` event for analytics
4. Routes to either `handleBackgroundRun()` or `handleForegroundRun()` based on:
   - Explicit `background` parameter
   - `api-background-runs` feature flag for the workspace

### Core Services

#### `runDocumentAtCommit` (`packages/core/src/services/commits/runDocumentAtCommit.ts`)

The main orchestration service that:

1. **Builds provider map**: Fetches all configured provider API keys for the workspace
2. **Resolves content**: Processes the prompt template, handling includes and references via `getResolvedContent()`
3. **Creates telemetry context**: Initializes a prompt span via `telemetry.span.prompt()` for tracing
4. **Validates the chain**: Uses `RunDocumentChecker` to:
   - Parse the prompt using PromptL
   - Handle `userMessage` parameter (adds `<user>{{LATITUDE_USER_MESSAGE}}</user>` if needed)
   - Process and validate parameters (including file type conversions)
   - Create a `Chain` object for execution
5. **Runs the chain**: Delegates to `runChain()` which creates a `ChainStreamManager`

#### `ChainStreamManager` (`packages/core/src/lib/streamManager/chainStreamManager.ts`)

Manages multi-step chain execution and streaming:

1. **Step execution**: Recursively calls `step()` to advance through the chain
2. **Chain validation**: Uses `validateChain()` to:
   - Render the next step of the chain
   - Find the appropriate provider from `providersMap`
   - Check provider quota limits
   - Apply provider-specific rules
3. **Tool resolution**: Calls `lookupTools()` and `resolveTools()` to prepare tools
4. **AI streaming**: Calls `streamAIResponse()` to stream responses from the provider
5. **State management**: Tracks messages, token usage, and responses across steps

#### `ai()` Service (`packages/core/src/services/ai/index.ts`)

Low-level AI provider integration:

1. **Rule application**: Applies provider-specific rules and validations
2. **Provider creation**: Creates the appropriate Vercel AI SDK provider adapter
3. **Model configuration**: Configures the language model with settings from the prompt config
4. **Stream execution**: Uses Vercel AI SDK's `streamText()` for streaming responses
5. **Schema support**: Handles structured output schemas when specified

### Background Execution

#### `enqueueRun` (`packages/core/src/services/runs/enqueue.ts`)

For background/async execution:

1. Creates an active run entry in Redis cache
2. Adds job to BullMQ `runsQueue` with deduplication
3. Publishes `runDocumentQueued` event

#### `backgroundRunJob` (`packages/core/src/jobs/job-definitions/runs/backgroundRunJob.ts`)

Processes queued runs:

1. Fetches document data using `getJobDocumentData()`
2. Marks run as started via `startRun()`
3. Calls `runDocumentAtCommit()` with abort controller
4. Forwards stream events to Redis stream for client consumption
5. Handles experiment integration (if applicable)
6. Cleans up and marks run as ended

### Telemetry & Tracing

#### Span/Trace Creation (`packages/core/src/telemetry/index.ts`)

Latitude uses OpenTelemetry for tracing prompt executions:

1. **LatitudeTelemetry**: Wraps OpenTelemetry SDK with custom span processors
2. **InternalExporter**: Converts spans to OTLP format and enqueues for processing
3. **Span Types** (`SpanType` enum):
   - `Prompt`: Top-level prompt execution
   - `Completion`: LLM completion calls
   - `Tool`: Tool executions
   - `Step`: Chain steps
   - `Embedding`, `Retrieval`, `Reranking`: Specialized operations

#### Span Ingestion (`packages/core/src/services/tracing/spans/`)

Spans are processed and stored:

1. `ingest.ts`: Entry point for span ingestion, extracts workspace/API key from attributes
2. `process.ts`: Converts OTLP attributes to internal format, determines span type
3. `prompt.ts`: Processes prompt-specific metadata (parameters, template, references)
4. Span metadata includes: `documentLogUuid`, `experimentUuid`, `promptUuid`, `versionUuid`, `source`

### Event System & Handlers

#### Event Handler Registration (`packages/core/src/events/handlers/index.ts`)

Events trigger asynchronous processing via registered handlers:

```typescript
export const EventHandlers: IEventsHandlers = {
  spanCreated: [evaluateLiveLogJob],
  providerLogCreated: [touchApiKeyJob, touchProviderApiKeyJob],
  evaluationResultV2Created: [assignIssueToEvaluationResultV2Job, ...],
  documentRunQueued: [notifyClientOfRunStatusByDocument],
  // ... many more event handlers
}
```

#### Live Evaluation Handler (`packages/core/src/events/handlers/evaluateLiveLog.ts`)

Automatically runs evaluations on prompt executions:

1. Triggered by `spanCreated` event for `SpanType.Prompt` spans
2. Filters to live-evaluable log sources (excludes `evaluation`, `experiment`)
3. Fetches evaluations configured for the document with `evaluateLiveLogs: true`
4. Enqueues `runEvaluationV2Job` for each applicable evaluation

### Evaluation System

#### Running Evaluations (`packages/core/src/services/evaluationsV2/run.ts`)

Evaluations assess prompt outputs:

1. Finds the prompt span and extracts actual/expected outputs
2. Validates evaluation hasn't already run for this span
3. Runs the evaluation specification (LLM-as-judge, rule-based, etc.)
4. Creates `EvaluationResultV2` record
5. Triggers downstream events (suggestions, issue detection)

#### Evaluation Specifications (`packages/core/src/services/evaluationsV2/specifications/`)

Different evaluation types with their own logic:

- LLM-as-judge evaluations
- Rule-based evaluations
- Custom metric evaluations
- Each specification defines `run()` and `supportsLiveEvaluation`

### Key Data Structures

#### PromptL Chain

The prompt is compiled into a `Chain` object (from `promptl-ai`) that:

- Holds the parsed AST and resolved prompt content
- Manages step-by-step execution via `chain.step()`
- Tracks completion state

#### ChainEvent

Stream events use the `ChainEvent` type with event types:

- `ChainStarted`, `ChainCompleted`, `ChainError`
- `StepStarted`, `StepCompleted`
- `ProviderStarted`, `ProviderCompleted`
- `ToolsStarted`, `ToolsCompleted`, `ToolsRequested`
- `IntegrationWakingUp`

### Tool Handling

Tools are resolved from multiple sources:

1. **Client tools**: Defined in the API request, handled by `buildClientToolHandlersMap()`
2. **Latitude tools**: Built-in tools like web search
3. **MCP tools**: From configured MCP integrations
4. **Agent tools**: Sub-prompts that can be called as tools

Tool resolution happens in `lookupTools()` and `resolveTools()` within the stream manager
