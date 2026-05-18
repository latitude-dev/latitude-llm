import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookies } from "@tanstack/react-start/server"
import { LAST_PROJECT_COOKIE_NAME, listProjects } from "../../domains/projects/projects.functions.ts"

const getLastProjectSlug = createServerFn({ method: "GET" }).handler(async (): Promise<string | null> => {
  const slug = getCookies()[LAST_PROJECT_COOKIE_NAME]
  return typeof slug === "string" && slug.length > 0 ? slug : null
})

export const Route = createFileRoute("/_authenticated/")({
  loader: async () => {
    const [lastSlug, projects] = await Promise.all([getLastProjectSlug(), listProjects()])
    const target = (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0]
    if (!target) return null
    throw redirect({
      to: "/projects/$projectSlug",
      params: { projectSlug: target.slug },
    })
  },
})
