import { notificationGroupSchema } from "@domain/shared"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { resolveDefaultProjectSlug } from "../../../domains/projects/projects.functions.ts"

/**
 * Top-level settings redirect. Resolves the user's "current" project (last
 * visited, else first available) and forwards to the project-scoped settings
 * page for that section.
 *
 * Lets external links — email footers, bookmarks, support docs — point at
 * `/settings/<section>` without knowing a project slug. Re-resolves at click
 * time, so the link still works after the project the email referenced is
 * deleted.
 *
 * The optional `?group=<NotificationGroup>` search param is forwarded as a
 * URL hash so the destination page (today: `account`) can scroll to the
 * matching toggle row. Hash fragments aren't sent server-side, so we carry
 * the intent through an explicit query param instead.
 */
const searchSchema = z.object({
  group: notificationGroupSchema.optional(),
})

export const Route = createFileRoute("/_authenticated/settings/$section")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ group: search.group }),
  loader: async ({ params, deps }) => {
    const slug = await resolveDefaultProjectSlug()
    if (!slug) throw redirect({ to: "/" })

    const hash = deps.group ? `notifications-${deps.group}` : ""
    throw redirect({
      href: `/projects/${slug}/settings/${params.section}${hash ? `#${hash}` : ""}`,
    })
  },
  component: () => null,
})
