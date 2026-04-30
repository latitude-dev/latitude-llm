/** True when the URL is a project-scoped onboarding screen (`/projects/:slug/onboarding`). */
export function isProjectOnboardingPathname(pathname: string): boolean {
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean)
  return segments.length === 3 && segments[0] === "projects" && segments[2] === "onboarding"
}
