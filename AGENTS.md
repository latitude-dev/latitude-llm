# Agent Guidelines for Latitude LLM

## Build/Test Commands

- `pnpm build` - Build all packages
- `pnpm dev` - Start development servers
- `pnpm lint` - Lint all packages
- `pnpm tc` - Type check all packages
- `pnpm test` - Run all tests
- `pnpm test:watch` - Run tests in watch mode (specific packages)
- `pnpm --filter @latitude-data/core db:migrate` - Run database migrations
- `pnpm --filter @latitude-data/core db:generate` - Generate database migrations
- `pnpm prettier` - Format code
- NEVER build packages with `pnpm build` unless specifically asked to

## Code Style

- Use TypeScript for all code, prefer types over interfaces
- Prettier config: single quotes, no semicolons, trailing commas
- Functional programming patterns, early returns for readability
- Named exports preferred, descriptive names with auxiliary verbs (isLoading, hasError)
- Event handlers prefixed with "handle" (handleClick, handleSubmit)
- Directories use lowercase with dashes (auth-wizard)
- Avoid enums, use const maps or type unions instead
- Use JSDoc comments for functions and classes that are exported. You can skip
  JSDoc for internal functions that are simple and self-explanatory.
- Exports go top of file, internal methods at the bottom
- If possible, use the instrumentation's captureException method rather than logging errors with console.error

## Architecture

- Monorepo with pnpm workspaces and Turborepo
- Core business logic in `packages/core`, UI components in `packages/web-ui`
- Services use functional approach, return Result abstraction for error handling
- Database operations use Transaction abstraction, models in `packages/core`
- Write operations receive optional `db` parameter defaulting to `database`
- Update/Delete services receive model instances, not IDs

## Testing

- Use factories extensively, minimize mocks for integration tests
- Tests located alongside source files with `.test.ts` extension
- Run `pnpm test` from package root or `pnpm --filter <package> test` for specific packages

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
- Actions fetch model instances using repositories before calling services
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

### Schema Definition (`packages/core/src/schema/models/`)

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

### Repository Pattern (`packages/core/src/repositories/`)

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
- Export components from `_components/index.ts`

### Component Patterns

- Import UI components from `@latitude-data/web-ui/atoms/` (not molecules)
- Use `Modal` from atoms, not molecules
- Use `TextArea` not `Textarea`
- Button sizes: `size='small'` not `size='sm'`
- Table components: `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`

## Feature Implementation Checklist

When implementing new features, follow this order:

1. **Database Schema**: Create tables, generate migration
2. **Services**: Implement business logic with Result pattern
3. **Repositories**: Create data access layer
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
