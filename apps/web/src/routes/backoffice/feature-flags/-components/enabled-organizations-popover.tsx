import { Badge, Button, Icon, Popover, PopoverContent, PopoverTrigger, Text, useToast } from "@repo/ui"
import { Link, useRouter } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useState } from "react"
import {
  type AdminFeatureFlagEnabledOrganizationDto,
  adminDisableFeatureFlagForOrganization,
} from "../../../../domains/admin/feature-flags.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface EnabledOrganizationsPopoverProps {
  readonly identifier: string
  readonly organizations: AdminFeatureFlagEnabledOrganizationDto[]
}

export function EnabledOrganizationsPopover({ identifier, organizations }: EnabledOrganizationsPopoverProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null)

  const count = organizations.length
  const normalizedSearch = search.trim().toLowerCase()
  const visible =
    normalizedSearch.length === 0
      ? organizations
      : organizations.filter((organization) =>
          `${organization.name} ${organization.slug}`.toLowerCase().includes(normalizedSearch),
        )

  const handleDisable = async (organization: AdminFeatureFlagEnabledOrganizationDto) => {
    setBusyOrgId(organization.id)
    try {
      await adminDisableFeatureFlagForOrganization({
        data: { organizationId: organization.id, identifier },
      })
      toast({ description: `Disabled "${identifier}" for ${organization.name}.` })
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not disable feature flag",
        description: toUserMessage(error),
      })
    } finally {
      setBusyOrgId(null)
    }
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
      <PopoverContent align="end" className="flex max-h-96 w-96 flex-col gap-3 overflow-hidden">
        <div className="flex flex-col gap-1">
          <Text.H6 weight="semibold">Enabled organizations</Text.H6>
          <Text.H6 color="foregroundMuted">
            {count === 1
              ? "This flag is enabled for 1 organization."
              : `This flag is enabled for ${count} organizations.`}
          </Text.H6>
        </div>
        {count > 5 ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <Icon icon={Search} size="sm" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organizations…"
            />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {visible.length === 0 ? (
            <Text.H6 color="foregroundMuted">No matching organizations.</Text.H6>
          ) : (
            visible.map((organization) => (
              <div
                key={organization.id}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Link
                  to="/backoffice/organizations/$organizationId"
                  params={{ organizationId: organization.id }}
                  className="flex min-w-0 flex-1 flex-col"
                >
                  <Text.H6 weight="medium" ellipsis>
                    {organization.name}
                  </Text.H6>
                  <Text.H6 color="foregroundMuted" ellipsis>
                    /{organization.slug}
                  </Text.H6>
                </Link>
                <Button
                  variant="destructive-soft"
                  size="sm"
                  disabled={busyOrgId === organization.id}
                  onClick={() => void handleDisable(organization)}
                >
                  {busyOrgId === organization.id ? "Disabling…" : "Disable"}
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
