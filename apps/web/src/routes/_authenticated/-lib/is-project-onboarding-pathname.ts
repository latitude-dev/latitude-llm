const PROJECT_ONBOARDING_PATH = /\/projects\/[^/]+\/onboarding\/?$/

/** True when the URL is a project-scoped onboarding screen (`/projects/:slug/onboarding`). */
export function isProjectOnboardingPathname(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/"
  return PROJECT_ONBOARDING_PATH.test(normalized)
}
