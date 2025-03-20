import { HandlerType, UrlParams } from '$sdk/utils/types'

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
        const getParams = params as UrlParams<HandlerType.GetDocument>
        return this.documents(getParams).document(getParams.path)
      }
      case HandlerType.GetAllDocuments: {
        const getParams = params as UrlParams<HandlerType.GetAllDocuments>
        return this.documents(getParams).root
      }
      case HandlerType.GetOrCreateDocument: {
        const getParams = params as UrlParams<HandlerType.GetOrCreateDocument>
        return this.documents(getParams).getOrCreate
      }
      case HandlerType.RunDocument: {
        const runParams = params as UrlParams<HandlerType.RunDocument>
        return this.documents(runParams).run
      }
      case HandlerType.Chat: {
        const chatParams = params as UrlParams<HandlerType.Chat>
        return this.conversations().chat(chatParams.conversationUuid)
      }
      case HandlerType.Log: {
        const logParams = params as UrlParams<HandlerType.Log>
        return this.documents(logParams).log
      }
      case HandlerType.Evaluate: {
        const evaluateParams = params as UrlParams<HandlerType.Evaluate>
        return this.conversations().evaluate(evaluateParams.conversationUuid)
      }
      case HandlerType.EvaluationResult: {
        const evaluationResultParams =
          params as UrlParams<HandlerType.EvaluationResult>
        return this.conversations().evaluationResult(
          evaluationResultParams.conversationUuid,
          evaluationResultParams.evaluationUuid,
        )
      }
      default:
        throw new Error(`Unknown handler: ${handler satisfies never}`)
    }
  }

  private conversations() {
    const base = `${this.baseUrl}/conversations`
    return {
      chat: (uuid: string) => `${base}/${uuid}/chat`,
      evaluate: (uuid: string) => `${base}/${uuid}/evaluate`,
      evaluationResult: (uuid: string, evaluationUuid: string) =>
        `${base}/${uuid}/evaluations/${evaluationUuid}/evaluation-results`,
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
