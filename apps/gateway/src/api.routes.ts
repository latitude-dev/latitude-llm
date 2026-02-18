const API_VERSIONED_ROUTES = (version: string) => ({
  tools: {
    results: `/api/${version}/tools/results`,
  },
  projects: {
    getAll: `/api/${version}/projects`,
    create: `/api/${version}/projects`,
    push: `/api/${version}/projects/:projectId/versions/:versionUuid/push`,
    versions: {
      get: `/api/${version}/projects/:projectId/versions/:versionUuid`,
      getAll: `/api/${version}/projects/:projectId/versions`,
      create: `/api/${version}/projects/:projectId/versions`,
      publish: `/api/${version}/projects/:projectId/versions/:versionUuid/publish`,
    },
    documents: {
      get: `/api/${version}/projects/:projectId/versions/:versionUuid/documents/:documentPath{.+}`,
      getAll: `/api/${version}/projects/:projectId/versions/:versionUuid/documents`,
      create: `/api/${version}/projects/:projectId/versions/:versionUuid/documents`,
      createOrUpdate: `/api/${version}/projects/:projectId/versions/:versionUuid/documents/create-or-update`,
      getOrCreate: `/api/${version}/projects/:projectId/versions/:versionUuid/documents/get-or-create`,
      logs: `/api/${version}/projects/:projectId/versions/:versionUuid/documents/logs`,
      run: `/api/${version}/projects/:projectId/versions/:versionUuid/documents/run`,
    },
  },
  conversations: {
    chat: `/api/${version}/conversations/:conversationUuid/chat`,
    stop: `/api/${version}/conversations/:conversationUuid/stop`,
    attach: `/api/${version}/conversations/:conversationUuid/attach`,
    annotate: `/api/${version}/conversations/:conversationUuid/evaluations/:evaluationUuid/annotate`,
    get: `/api/${version}/conversations/:conversationUuid`,
  },
  traces: {
    ingest: `/api/${version}/traces`,
  },
  datasets: {
    getAll: `/api/${version}/datasets`,
    get: `/api/${version}/datasets/:datasetId`,
    create: `/api/${version}/datasets`,
    update: `/api/${version}/datasets/:datasetId`,
    destroy: `/api/${version}/datasets/:datasetId`,
  },
  datasetRows: {
    getAll: `/api/${version}/dataset-rows`,
    get: `/api/${version}/dataset-rows/:rowId`,
    create: `/api/${version}/dataset-rows`,
    update: `/api/${version}/dataset-rows/:rowId`,
    destroy: `/api/${version}/dataset-rows/:rowId`,
  },
  providerApiKeys: {
    getAll: `/api/${version}/provider-api-keys`,
    get: `/api/${version}/provider-api-keys/:providerApiKeyId`,
    create: `/api/${version}/provider-api-keys`,
    update: `/api/${version}/provider-api-keys/:providerApiKeyId`,
    destroy: `/api/${version}/provider-api-keys/:providerApiKeyId`,
  },
})

export const API_ROUTES = {
  v3: API_VERSIONED_ROUTES('v3'),
  v4: API_VERSIONED_ROUTES('v4'),
} as const
