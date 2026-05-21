import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookies } from "@tanstack/react-start/server"
import { z } from "zod"
import { LAST_PROJECT_COOKIE_NAME, listProjects } from "../../domains/projects/projects.functions.ts"

const getLastProjectSlug = createServerFn({ method: "GET" }).handler(async (): Promise<string | null> => {
  const slug = getCookies()[LAST_PROJECT_COOKIE_NAME]
  return typeof slug === "string" && slug.length > 0 ? slug : null
})

/**
 * Landing route. Picks the user's current project (last-viewed cookie,
 * falling back to the first available) and redirects there.
 *
 * Accepts a `?next=…` hint so flows that finish outside the project
 * tree (today: the Slack OAuth callback) can hand off here without
 * needing to know a slug. When `next` is recognised, the resolved
 * slug is substituted into the matching nested route and any flash
 * params (`installed`, `error`) are forwarded.
 */
const searchSchema = z.object({
  next: z.literal("integrations").optional(),
  installed: z.literal("ok").optional(),
  error: z.enum(["workspace_taken", "oauth_failed"]).optional(),
})

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ next: search.next, installed: search.installed, error: search.error }),
  loader: async ({ deps }) => {
    const [lastSlug, projects] = await Promise.all([getLastProjectSlug(), listProjects()])
    const target = (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0]
    if (!target) return null

    if (deps.next === "integrations") {
      throw redirect({
        to: "/projects/$projectSlug/settings/integrations",
        params: { projectSlug: target.slug },
        search: {
          ...(deps.installed ? { installed: deps.installed } : {}),
          ...(deps.error ? { error: deps.error } : {}),
        },
      })
    }

    throw redirect({
      to: "/projects/$projectSlug",
      params: { projectSlug: target.slug },
    })
  },
})
