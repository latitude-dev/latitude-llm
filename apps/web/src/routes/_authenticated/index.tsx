import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { resolveDefaultProjectSlug } from "../../domains/projects/projects.functions.ts"

/**
 * Landing route. Picks the user's current project (last-viewed cookie,
 * falling back to the first available) and redirects there.
 *
 * Accepts a `?next=…` hint so flows that finish outside the project
 * tree (today: the Slack and GitHub install callbacks) can hand off
 * here without needing to know a slug. Connections are organization-wide,
 * so `next=integrations` lands on the organization's Integrations tab with
 * the flash params (`installed`, `error`) forwarded.
 */
const searchSchema = z.object({
  next: z.literal("integrations").optional(),
  installed: z.literal("ok").optional(),
  error: z.string().optional(),
  githubInstalled: z.literal("ok").optional(),
  githubPending: z.literal("approval").optional(),
  githubError: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    next: search.next,
    installed: search.installed,
    error: search.error,
    githubInstalled: search.githubInstalled,
    githubPending: search.githubPending,
    githubError: search.githubError,
  }),
  loader: async ({ deps }) => {
    const slug = await resolveDefaultProjectSlug()
    if (!slug) return null

    if (deps.next === "integrations") {
      throw redirect({
        to: "/projects/$projectSlug/settings/organization/integrations",
        params: { projectSlug: slug },
        search: {
          ...(deps.installed ? { installed: deps.installed } : {}),
          ...(deps.error ? { error: deps.error } : {}),
          ...(deps.githubInstalled ? { githubInstalled: deps.githubInstalled } : {}),
          ...(deps.githubPending ? { githubPending: deps.githubPending } : {}),
          ...(deps.githubError ? { githubError: deps.githubError } : {}),
        },
      })
    }

    throw redirect({
      to: "/projects/$projectSlug",
      params: { projectSlug: slug },
    })
  },
})
