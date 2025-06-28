import {
  AnnotateUrlParams,
  ChatUrlParams,
  CreateVersionUrlParams,
  GetAllDocumentsParams,
  GetDocumentUrlParams,
  GetOrCreateDocumentUrlParams,
  GetversionUrlParams,
  HandlerType,
  PushVersionUrlParams,
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

  // TODO: FIXME: This can be done without asserting types
  resolve<T extends HandlerType>({ handler, params }: ResolveParams<T>) {
    switch (handler) {
      case HandlerType.GetDocument: {
        const p = params as GetDocumentUrlParams
        return this.projects
          .project(p.projectId)
          .versions.version(p.versionUuid ?? 'live')
          .documents.document(p.path)
      }
      case HandlerType.GetAllDocuments: {
        const p = params as GetAllDocumentsParams
        return this.projects
          .project(p.projectId)
          .versions.version(p.versionUuid ?? 'live').documents.root
      }
      case HandlerType.GetOrCreateDocument: {
        const p = params as GetOrCreateDocumentUrlParams
        return this.projects
          .project(p.projectId)
          .versions.version(p.versionUuid ?? 'live').documents.getOrCreate
      }
      case HandlerType.CreateDocument: {
        const p = params as GetOrCreateDocumentUrlParams
        return this.projects
          .project(p.projectId)
          .versions.version(p.versionUuid ?? 'live').documents.root
      }
      case HandlerType.RunDocument: {
        const p = params as RunDocumentUrlParams
        return this.projects
          .project(p.projectId)
          .versions.version(p.versionUuid ?? 'live').documents.run
      }
      case HandlerType.Chat: {
        const p = params as ChatUrlParams
        return this.conversations().chat(p.conversationUuid)
      }
      case HandlerType.Annotate: {
        const p = params as AnnotateUrlParams
        return this.conversations().annotate(
          p.conversationUuid,
          p.evaluationUuid,
        )
      }
      case HandlerType.GetAllProjects:
        return this.projects.root
      case HandlerType.GetProjectById: {
        const p = params as { projectId: number }
        return this.projects.project(p.projectId).root
      }
      case HandlerType.CreateProject:
        return this.projects.root
      case HandlerType.CreateVersion:
        return this.projects.project(
          (params as CreateVersionUrlParams).projectId,
        ).versions.root
      case HandlerType.GetVersion:
        return this.projects
          .project((params as GetversionUrlParams).projectId)
          .versions.version((params as GetversionUrlParams).versionUuid).root
      case HandlerType.PushVersion:
        return this.projects
          .project((params as PushVersionUrlParams).projectId)
          .versions.version((params as PushVersionUrlParams).commitUuid).push
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

  private get projects() {
    const base = `${this.baseUrl}/projects`
    return {
      root: base,
      project: (projectId: number) => ({
        root: `${this.baseUrl}/projects/${projectId}`,
        documents: `${this.baseUrl}/projects/${projectId}/documents`,
        versions: {
          root: `${this.baseUrl}/projects/${projectId}/versions`,
          version: (versionUuid: string) => ({
            root: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}`,
            push: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/push`,
            documents: {
              root: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/documents`,
              document: (path: string) =>
                `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/documents/${path}`,
              getOrCreate: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/documents/get-or-create`,
              run: `${this.baseUrl}/projects/${projectId}/versions/${versionUuid}/documents/run`,
            },
          }),
        },
      }),
    }
  }

  private get baseUrl() {
    return `${this.basePath}/api/${this.apiVersion}`
  }
}
