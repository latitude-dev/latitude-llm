import {
  GetDocumentUrlParams,
  HandlerType,
  RunUrlParams,
  UrlParams,
} from '$sdk/utils/types'

type ResolveParams<T extends HandlerType> = {
  handler: T
  params?: UrlParams<T>
}
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

  resolve<T extends HandlerType>({ handler, params }: ResolveParams<T>) {
    switch (handler) {
      case HandlerType.RunDocument:
        return this.documents(params as RunUrlParams).run
      case HandlerType.GetDocument: {
        const getParams = params as GetDocumentUrlParams
        return this.documents(getParams).document(getParams.documentPath)
      }
      case HandlerType.AddMessageToDocumentLog:
        return this.chats().addMessage
      default:
        throw new Error(`Unknown handler: ${handler satisfies never}`)
    }
  }

  private chats() {
    const base = `${this.baseUrl}/chats`
    return {
      addMessage: `${base}/add-message`,
    }
  }

  private documents(params: { projectId: number; commitUuid?: string }) {
    const base = `${this.commitsUrl(params)}/documents`
    return {
      run: `${base}/run`,
      document: (documentPath: string) => `${base}/${documentPath}`,
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
