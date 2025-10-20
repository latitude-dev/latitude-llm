export const API_ROUTES = {
  v3: {
    tools: {
      results: `/api/v3/tools/results`,
    },
    projects: {
      getAll: '/api/v3/projects',
      create: '/api/v3/projects',
      push: '/api/v3/projects/:projectId/versions/:versionUuid/push',
      versions: {
        get: '/api/v3/projects/:projectId/versions/:versionUuid',
        getAll: '/api/v3/projects/:projectId/versions',
        create: '/api/v3/projects/:projectId/versions',
      },
      documents: {
        get: '/api/v3/projects/:projectId/versions/:versionUuid/documents/:documentPath{.+}',
        getAll: '/api/v3/projects/:projectId/versions/:versionUuid/documents',
        create: '/api/v3/projects/:projectId/versions/:versionUuid/documents',
        getOrCreate:
          '/api/v3/projects/:projectId/versions/:versionUuid/documents/get-or-create',
        logs: '/api/v3/projects/:projectId/versions/:versionUuid/documents/logs',
        run: '/api/v3/projects/:projectId/versions/:versionUuid/documents/run',
      },
    },
    conversations: {
      chat: '/api/v3/conversations/:conversationUuid/chat',
      stop: '/api/v3/conversations/:conversationUuid/stop',
      attach: '/api/v3/conversations/:conversationUuid/attach',
      annotate:
        '/api/v3/conversations/:conversationUuid/evaluations/:evaluationUuid/annotate',
    },
    traces: {
      ingest: '/api/v3/traces',
    },
  },
}
