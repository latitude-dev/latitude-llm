const PROJECT_DEFAULT_TIME_WINDOW_DAYS = 30
const SHOWCASE_TIME_WINDOW_DAYS = 14

// Showcase narrows to 14d because its demo only seeds ~2 weeks (tau2 at `% 14` days ago); 30d would render half-empty.
export function defaultProjectTimeWindowDays(project: { readonly isShowcase: boolean }): number {
  return project.isShowcase ? SHOWCASE_TIME_WINDOW_DAYS : PROJECT_DEFAULT_TIME_WINDOW_DAYS
}

export function defaultProjectTimeWindowSeconds(project: { readonly isShowcase: boolean }): number {
  return defaultProjectTimeWindowDays(project) * 24 * 60 * 60
}
