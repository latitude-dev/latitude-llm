import {
  ChatUrlParams,
  AnnotateUrlParams,
  GetAllDocumentsParams,
  GetDocumentUrlParams,
  GetOrCreateDocumentUrlParams,
  HandlerType,
  LogUrlParams,
  RunDocumentUrlParams,
  UrlParams,
} from '$sdk/utils/types'

type ResolveParams<T extends HandlerType> = {
  handler: T
  params?: UrlParams<T>
}
export type GatewayApiConfig = {
  host: string
  port: number | undefined
  ssl: boolean
}
export class RouteResolver {
  private basePath: string
  private apiVersion: string

  constructor({
    apiVersion = 'v1',
    gateway,
  }: {
    apiVersion?: string
    gateway: GatewayApiConfig
  }) {
    const protocol = gateway.ssl ? 'https' : 'http'
    const domain = gateway.port
      ? `${gateway.host}:${gateway.port}`
      : gateway.host
    this.basePath = `${protocol}://${domain}`
    this.apiVersion = apiVersion
  }

  resolve<T extends HandlerType>({ handler, params }: ResolveParams<T>) {
    switch (handler) {
      case HandlerType.GetDocument: {
        const getParams = params as GetDocumentUrlParams
        return this.documents(getParams).document(getParams.path)
      }
      case HandlerType.GetAllDocuments: {
        const getParams = params as GetAllDocumentsParams
        return this.documents(getParams).root
      }
      case HandlerType.GetOrCreateDocument: {
        return this.documents(params as GetOrCreateDocumentUrlParams)
          .getOrCreate
      }
      case HandlerType.RunDocument:
        return this.documents(params as RunDocumentUrlParams).run
      case HandlerType.Chat:
        return this.conversations().chat(
          (params as ChatUrlParams).conversationUuid,
        )
      case HandlerType.Log:
        return this.documents(params as LogUrlParams).log
      case HandlerType.Annotate:
        return this.conversations().annotate(
          (params as ChatUrlParams).conversationUuid,
          (params as AnnotateUrlParams).evaluationUuid,
        )
      default:
        throw new Error(`Unknown handler: ${handler satisfies never}`)
    }
  }

  private conversations() {
    const base = `${this.baseUrl}/conversations`
    return {
      chat: (uuid: string) => `${base}/${uuid}/chat`,
      annotate: (uuid: string, evaluationUuid: string) =>
        `${base}/${uuid}/evaluations/${evaluationUuid}/annotate`,
    }
  }

  private documents(params: { projectId: number; versionUuid?: string }) {
    const base = `${this.commitsUrl(params)}/documents`
    return {
      root: base,
      document: (path: string) => `${base}/${path}`,
      getOrCreate: `${base}/get-or-create`,
      run: `${base}/run`,
      log: `${base}/logs`,
    }
  }

  private commitsUrl({
    projectId,
    versionUuid,
  }: {
    projectId: number
    versionUuid?: string
  }) {
    // TODO: Think how to share HEAD_COMMIT constant from core
    // I don't want to require all core just for this
    const commit = versionUuid ?? 'live'
    return `${this.projectsUrl({ projectId })}/versions/${commit}`
  }

  private projectsUrl({ projectId }: { projectId: number }) {
    return `${this.baseUrl}/projects/${projectId}`
  }

  private get baseUrl() {
    return `${this.basePath}/api/${this.apiVersion}`
  }
}
