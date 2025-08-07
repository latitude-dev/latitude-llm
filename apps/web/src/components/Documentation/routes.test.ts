import { describe, it, expect } from 'vitest'
import { getRouteFromPathname, DocsRoute } from './routes'

describe('getRouteFromPathname', () => {
  it('returns Introduction for root and unknown routes', () => {
    expect(getRouteFromPathname('/')).toBe(DocsRoute.Introduction)
    expect(getRouteFromPathname('/foo/bar')).toBe(DocsRoute.Introduction)
  })

  it('returns Introduction for /dashboard', () => {
    expect(getRouteFromPathname('/dashboard')).toBe(DocsRoute.Introduction)
  })

  it('returns Datasets for /datasets', () => {
    expect(getRouteFromPathname('/datasets')).toBe(DocsRoute.Datasets)
  })

  it('returns ProductManagers for /settings', () => {
    expect(getRouteFromPathname('/settings')).toBe(DocsRoute.ProductManagers)
  })

  it('handles project/version/document segments', () => {
    expect(getRouteFromPathname('/projects/1/versions/2/documents/3')).toBe(DocsRoute.Editor)
    expect(getRouteFromPathname('/projects/1/versions/2/documents/3/')).toBe(DocsRoute.Editor)
  })

  it('handles evaluations and logs', () => {
    expect(getRouteFromPathname('/projects/1/versions/2/documents/3/evaluations')).toBe(
      DocsRoute.Evaluations,
    )
    expect(getRouteFromPathname('/projects/1/versions/2/documents/3/logs')).toBe(DocsRoute.Logs)
    expect(getRouteFromPathname('/projects/1/versions/2/documents/3/logs/extra')).toBe(
      DocsRoute.Logs,
    )
  })

  it('handles overview and history under versions', () => {
    expect(getRouteFromPathname('/projects/1/versions/2/overview')).toBe(DocsRoute.CoreConcepts)
    expect(getRouteFromPathname('/projects/1/versions/2/history')).toBe(DocsRoute.VersionControl)
  })
})
