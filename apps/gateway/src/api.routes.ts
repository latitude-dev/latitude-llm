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
        publish: '/api/v3/projects/:projectId/versions/:versionUuid/publish',
      },
      documents: {
        get: '/api/v3/projects/:projectId/versions/:versionUuid/documents/:documentPath{.+}',
        getAll: '/api/v3/projects/:projectId/versions/:versionUuid/documents',
        create: '/api/v3/projects/:projectId/versions/:versionUuid/documents',
        createOrUpdate:
          '/api/v3/projects/:projectId/versions/:versionUuid/documents/create-or-update',
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
      get: '/api/v3/conversations/:conversationUuid',
    },
    traces: {
      ingest: '/api/v3/traces',
    },
    datasets: {
      getAll: '/api/v3/datasets',
      get: '/api/v3/datasets/:datasetId',
      create: '/api/v3/datasets',
      update: '/api/v3/datasets/:datasetId',
      destroy: '/api/v3/datasets/:datasetId',
    },
    datasetRows: {
      getAll: '/api/v3/dataset-rows',
      get: '/api/v3/dataset-rows/:rowId',
      create: '/api/v3/dataset-rows',
      update: '/api/v3/dataset-rows/:rowId',
      destroy: '/api/v3/dataset-rows/:rowId',
    },
    providerApiKeys: {
      getAll: '/api/v3/provider-api-keys',
      get: '/api/v3/provider-api-keys/:providerApiKeyId',
      create: '/api/v3/provider-api-keys',
      update: '/api/v3/provider-api-keys/:providerApiKeyId',
      destroy: '/api/v3/provider-api-keys/:providerApiKeyId',
    },
  },
}
