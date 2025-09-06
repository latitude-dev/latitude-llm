export const API_ROUTES = {
  v1: {
    documents: {
      get: `/api/v1/projects/:projectId/versions/:versionUuid/documents/{documentPath:.+}`,
      run: `/api/v1/projects/:projectId/versions/:versionUuid/documents/run`,
      logs: `/api/v1/projects/:projectId/versions/:versionUuid/documents/logs`,
    },
    conversations: {
      chat: `/api/v1/conversations/{conversationUuid}/chat`,
    },
  },
  v2: {
    documents: {
      get: `/api/v2/projects/:projectId/versions/:versionUuid/documents/:documentPath{.+}`,
      getOrCreate: `/api/v2/projects/:projectId/versions/:versionUuid/documents/get-or-create`,
      run: `/api/v2/projects/:projectId/versions/:versionUuid/documents/run`,
      logs: `/api/v2/projects/:projectId/versions/:versionUuid/documents/logs`,
    },
    conversations: {
      chat: `/api/v2/conversations/:conversationUuid/chat`,
      evaluate: `/api/v2/conversations/:conversationUuid/evaluate`,
      createEvaluationResult: `/api/v2/conversations/:conversationUuid/evaluations/:evaluationUuid/evaluation-results`,
    },
  },
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
      evaluate: '/api/v3/conversations/:conversationUuid/evaluate',
      createEvaluationResult:
        '/api/v3/conversations/:conversationUuid/evaluations/:evaluationUuid/evaluation-results',
      annotate:
        '/api/v3/conversations/:conversationUuid/evaluations/:evaluationUuid/annotate',
    },
    traces: {
      ingest: '/api/v3/traces',
    },
  },
}
