import {
  BaseParams,
  EntityType,
  HandlerType,
  UrlParams,
} from '$sdk/utils/types'

export class RouteResolver {
  private basePath: string
  private apiVersion: string

  constructor({
    basePath,
    https,
    apiVersion = 'v1',
  }: {
    basePath: string
    https: boolean
    apiVersion?: string
  }) {
    const protocol = https ? 'https' : 'http'
    this.basePath = `${protocol}://${basePath}`
    this.apiVersion = apiVersion
  }

  resolve({ handler, params }: UrlParams) {
    const baseUrl = this.baseEntityUrl({ entity: EntityType.Commit, params })

    const documentsUrl = `${baseUrl}/documents`
    switch (handler) {
      case HandlerType.RunDocument:
        return `${documentsUrl}/run`
      case HandlerType.GetDocument:
        return `${documentsUrl}/${params.documentPath}`
      default:
        throw new Error(`Unknown handler: ${handler satisfies never}`)
    }
  }

  private baseEntityUrl({ entity, params }: BaseParams) {
    switch (entity) {
      case EntityType.Commit:
        return this.commitsUrl(params)
      default:
        throw new Error(`Unknown entity: ${entity satisfies never}`)
    }
  }

  private commitsUrl({
    projectId,
    commitUuid,
  }: {
    projectId: number
    commitUuid?: string
  }) {
    // TODO: Think how to share HEAD_COMMIT constant from core
    // I don't want to require all core just for this
    const commit = commitUuid ?? 'live'
    return `${this.projectsUrl({ projectId })}/commits/${commit}`
  }

  private projectsUrl({ projectId }: { projectId: number }) {
    return `${this.baseUrl}/projects/${projectId}`
  }

  private get baseUrl() {
    return `${this.basePath}/api/${this.apiVersion}`
  }
}
