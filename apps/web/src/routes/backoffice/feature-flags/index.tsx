import {
  Badge,
  Button,
  CloseTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  FormWrapper,
  Icon,
  Input,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
  useToast,
} from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Archive, Flag, MoreHorizontal, Plus, Search } from "lucide-react"
import { useState } from "react"
import {
  type AdminFeatureFlagDto,
  type AdminFeatureFlagEnabledOrganizationDto,
  adminArchiveFeatureFlag,
  adminCreateFeatureFlag,
  adminListFeatureFlags,
} from "../../../domains/admin/feature-flags.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"

export const Route = createFileRoute("/backoffice/feature-flags/")({
  loader: async () => {
    const featureFlags = await adminListFeatureFlags()
    return { featureFlags }
  },
  component: BackofficeFeatureFlagsPage,
})

function BackofficeFeatureFlagsPage() {
  const { featureFlags } = Route.useLoaderData() as { readonly featureFlags: AdminFeatureFlagDto[] }
  const enabledOrganizationCount = featureFlags.reduce((total, flag) => total + flag.enabledOrganizations.length, 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon icon={Flag} size="sm" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text.H4 weight="semibold">Feature Flags</Text.H4>
              <Text.H6 color="foregroundMuted">Manage stable code-facing flags and where they are enabled.</Text.H6>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outlineMuted" noWrap>
              {featureFlags.length === 1 ? "1 active flag" : `${featureFlags.length} active flags`}
            </Badge>
            <Badge variant="outlineMuted" noWrap>
              {enabledOrganizationCount === 1
                ? "1 organization enablement"
                : `${enabledOrganizationCount} organization enablements`}
            </Badge>
          </div>
        </div>
        <CreateFeatureFlagButton />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6">
        {featureFlags.length === 0 ? (
          <EmptyFeatureFlagsState />
        ) : (
          <Table wrapperClassName="rounded-lg" overflow="overflow-auto">
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Flag</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-52">Enabled Organizations</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {featureFlags.map((featureFlag) => (
                <FeatureFlagRow key={featureFlag.id} featureFlag={featureFlag} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

function EmptyFeatureFlagsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={Flag} size="default" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <Text.H5 weight="medium">No feature flags yet</Text.H5>
        <Text.H6 color="foregroundMuted">
          Create the first code-facing flag, then enable it for specific organizations from their Backoffice detail
          page.
        </Text.H6>
      </div>
    </div>
  )
}

function FeatureFlagRow({ featureFlag }: { readonly featureFlag: AdminFeatureFlagDto }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isArchiving, setIsArchiving] = useState(false)

  const handleArchive = async () => {
    if (!window.confirm(`Archive feature flag "${featureFlag.identifier}"?`)) return

    setIsArchiving(true)
    try {
      await adminArchiveFeatureFlag({ data: { identifier: featureFlag.identifier } })
      toast({ description: `Archived "${featureFlag.identifier}".` })
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not archive feature flag",
        description: toUserMessage(error),
      })
    } finally {
      setIsArchiving(false)
    }
  }

  return (
    <TableRow verticalPadding>
      <TableCell className="min-w-72">
        <div className="flex min-w-0 flex-col gap-1">
          <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{featureFlag.identifier}</code>
          <Text.H6
            color={featureFlag.name ? "foreground" : "foregroundMuted"}
            weight={featureFlag.name ? "medium" : "normal"}
          >
            {featureFlag.name ?? "Unnamed flag"}
          </Text.H6>
        </div>
      </TableCell>
      <TableCell className="min-w-96">
        <Text.H6 color="foregroundMuted" ellipsis>
          {featureFlag.description ?? "No description."}
        </Text.H6>
      </TableCell>
      <TableCell>
        <EnabledOrganizationsPopover organizations={featureFlag.enabledOrganizations} />
      </TableCell>
      <TableCell align="right">
        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={isArchiving}
              aria-label={`Actions for ${featureFlag.identifier}`}
            >
              <Icon icon={MoreHorizontal} size="sm" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="gap-2 text-destructive-muted-foreground"
              disabled={isArchiving}
              onSelect={(event) => {
                event.preventDefault()
                void handleArchive()
              }}
            >
              <Icon icon={Archive} size="sm" />
              {isArchiving ? "Archiving..." : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuRoot>
      </TableCell>
    </TableRow>
  )
}

function EnabledOrganizationsPopover({
  organizations,
}: {
  readonly organizations: AdminFeatureFlagEnabledOrganizationDto[]
}) {
  const [search, setSearch] = useState("")
  const count = organizations.length
  const normalizedSearch = search.trim().toLowerCase()
  const visibleOrganizations =
    normalizedSearch.length === 0
      ? organizations
      : organizations.filter((organization) =>
          `${organization.name} ${organization.slug}`.toLowerCase().includes(normalizedSearch),
        )

  if (count === 0) {
    return (
      <Badge variant="noBorderMuted" noWrap>
        No orgs
      </Badge>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer">
          <Badge variant="outlineAccent" noWrap>
            {count === 1 ? "1 organization" : `${count} organizations`}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-96 w-80 flex-col gap-3 overflow-hidden">
        <div className="flex flex-col gap-1">
          <Text.H6 weight="semibold">Enabled organizations</Text.H6>
          <Text.H6 color="foregroundMuted">
            {count === 1
              ? "This flag is enabled in 1 organization."
              : `This flag is enabled in ${count} organizations.`}
          </Text.H6>
        </div>
        {count > 5 ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <Icon icon={Search} size="sm" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organizations..."
            />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {visibleOrganizations.length === 0 ? (
            <Text.H6 color="foregroundMuted">No matching organizations.</Text.H6>
          ) : (
            visibleOrganizations.map((organization) => (
              <Link
                key={organization.id}
                to="/backoffice/organizations/$organizationId"
                params={{ organizationId: organization.id }}
                className="flex flex-col rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Text.H6 weight="medium">{organization.name}</Text.H6>
                <Text.H6 color="foregroundMuted">/{organization.slug}</Text.H6>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CreateFeatureFlagButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm({
    defaultValues: { identifier: "", name: "", description: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        return await adminCreateFeatureFlag({
          data: {
            identifier: value.identifier,
            name: value.name,
            description: value.description,
          },
        })
      },
      {
        onSuccess: async (featureFlag) => {
          toast({ description: `Created "${featureFlag.identifier}".` })
          setIsOpen(false)
          void router.invalidate()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Could not create feature flag",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  const identifierPreview = form.state.values.identifier.trim()

  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>
        <Icon icon={Plus} size="sm" />
        Create feature flag
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) form.reset()
          setIsOpen(next)
        }}
      >
        <Modal.Content dismissible size="large">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <Modal.Header
              title="Create feature flag"
              description="Create the stable identifier that code will reference."
            />
            <Modal.Body>
              <FormWrapper>
                <form.Field name="identifier">
                  {(field) => (
                    <Input
                      required
                      label="Identifier"
                      description="Use a stable code-facing id, for example billing.v2 or new-dashboard. Avoid renaming after code references it."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="new-dashboard"
                      autoComplete="off"
                    />
                  )}
                </form.Field>
                <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <Text.H6 color="foregroundMuted">Identifier preview</Text.H6>
                  <code className="font-mono text-sm">
                    {identifierPreview.length > 0 ? identifierPreview : "(empty)"}
                  </code>
                </div>
                <form.Field name="name">
                  {(field) => (
                    <Input
                      label="Name"
                      description="Optional human-facing label for Backoffice."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="New dashboard"
                      autoComplete="off"
                    />
                  )}
                </form.Field>
                <form.Field name="description">
                  {(field) => (
                    <Textarea
                      label="Description"
                      description="Optional context for when staff should enable this flag."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="What this flag enables and when staff should use it."
                      minRows={4}
                    />
                  )}
                </form.Field>
              </FormWrapper>
            </Modal.Body>
            <Modal.Footer>
              <CloseTrigger />
              <Button type="submit" size="sm" disabled={form.state.isSubmitting}>
                {form.state.isSubmitting ? "Creating..." : "Create feature flag"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
