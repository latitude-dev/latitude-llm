import { Avatar, Badge, Container, Text } from "@repo/ui"
import { createFileRoute, notFound } from "@tanstack/react-router"
import type { AdminUserDetailsMembershipDto } from "../../../domains/admin/users.functions.ts"
import { adminGetUser } from "../../../domains/admin/users.functions.ts"
import { ImpersonateUserButton } from "../-components/impersonate-user-button.tsx"

export const Route = createFileRoute("/backoffice/users/$userId")({
  loader: async ({ params }) => {
    try {
      const user = await adminGetUser({ data: { userId: params.userId } })
      return { user }
    } catch {
      // Both "user not found" and "non-admin" throw NotFoundError from
      // our server function. From the UI's point of view they are the
      // same: render the standard 404.
      throw notFound()
    }
  },
  component: BackofficeUserDetailPage,
})

function BackofficeUserDetailPage() {
  const user = Route.useLoaderData({ select: (data) => data.user })

  return (
    <Container className="pt-6 pb-10 flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={user.name?.trim() ? user.name : user.email} size="md" imageSrc={user.image ?? undefined} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <Text.H3 weight="semibold" ellipsis noWrap>
                {user.email}
              </Text.H3>
              {user.role === "admin" && <Badge variant="destructive">admin</Badge>}
            </div>
            <Text.H5 color="foregroundMuted" ellipsis noWrap>
              {user.name ?? "(no name)"} · {user.id}
            </Text.H5>
          </div>
        </div>
        <ImpersonateUserButton userId={user.id} userEmail={user.email} />
      </header>

      <section className="flex flex-col gap-2">
        <Text.H5 weight="semibold">Profile</Text.H5>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border bg-background px-4 py-3">
          <DetailRow label="User id" value={user.id} />
          <DetailRow label="Created" value={formatDate(user.createdAt)} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Role" value={user.role} />
          <DetailRow label="Name" value={user.name ?? "(not set)"} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Text.H5 weight="semibold">Memberships ({user.memberships.length})</Text.H5>
        {user.memberships.length === 0 ? (
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <Text.H5 color="foregroundMuted">This user is not a member of any organization.</Text.H5>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {user.memberships.map((m: AdminUserDetailsMembershipDto) => (
              <div
                key={m.organizationId}
                className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-3"
              >
                <div className="flex flex-col min-w-0">
                  <Text.H5 weight="medium" ellipsis noWrap>
                    {m.organizationName}
                  </Text.H5>
                  <Text.H6 color="foregroundMuted" ellipsis noWrap>
                    /{m.organizationSlug} · {m.organizationId}
                  </Text.H6>
                </div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </Container>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6>{value}</Text.H6>
    </>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return iso
  }
}
