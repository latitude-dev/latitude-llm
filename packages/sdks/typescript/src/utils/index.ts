import {
  ChatUrlParams,
  AnnotateUrlParams,
  GetAllDocumentsParams,
  GetDocumentUrlParams,
  GetOrCreateDocumentUrlParams,
  HandlerType,
  LogUrlParams,
  PushCommitUrlParams,
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
      case HandlerType.CreateDocument: {
        return this.project(params as GetOrCreateDocumentUrlParams).documents
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
      case HandlerType.GetAllProjects:
        return this.projects().root
      case HandlerType.CreateProject:
        return this.projects().root
      case HandlerType.GetVersion:
        return this.versionsUrl(
          params as { projectId: number; versionUuid?: string },
        )
      case HandlerType.CreateVersion:
        return this.project(params as { projectId: number }).versions.root
      case HandlerType.PushCommit:
        return this.project({
          projectId: (params as PushCommitUrlParams).projectId,
        }).versions.version((params as PushCommitUrlParams).commitUuid).push
      default:
        throw new Error(`Unknown handler: ${handler}`)
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
    const base = `${this.versionsUrl(params)}/documents`
    return {
      root: base,
      document: (path: string) => `${base}/${path}`,
      getOrCreate: `${base}/get-or-create`,
      run: `${base}/run`,
      log: `${base}/logs`,
    }
  }

  private versionsUrl({
    projectId,
    // TODO: Think how to share HEAD_COMMIT constant from core
    // I don't want to require all core just for this
    versionUuid = 'live',
  }: {
    projectId: number
    versionUuid?: string
  }) {
    return `${this.project({ projectId }).versions.root}/${versionUuid}`
  }

  private projects() {
    const base = `${this.baseUrl}/projects`
    return {
      root: base,
    }
  }

  private project({ projectId }: { projectId: number }) {
    return {
      root: `${this.baseUrl}/projects/${projectId}`,
      documents: `${this.baseUrl}/projects/${projectId}/documents`,
      versions: {
        root: `${this.baseUrl}/projects/${projectId}/versions`,
        version: (versionUuid: string) => ({
          root: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}`,
          documents: {
            diff: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/documents/diff`,
          },
          push: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/push`,
        }),
      },
    }
  }

  private get baseUrl() {
    return `${this.basePath}/api/${this.apiVersion}`
  }
}
