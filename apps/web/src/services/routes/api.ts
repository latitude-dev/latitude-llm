export const _API_ROUTES = {
  apiKeys: {
    root: '/api/apiKeys',
  },
  providerApiKeys: {
    root: '/api/providerApiKeys',
  },
  claimedRewards: {
    root: '/api/claimedRewards',
  },
  providerLogs: {
    root: '/api/providerLogs',
  },
  users: {
    root: '/api/users',
  },
  projects: {
    root: '/api/projects',
    detail: (id: number) => ({
      commits: {
        root: `/api/projects/${id}/commits`,
      },
    }),
  },
  evaluations: {
    root: '/api/evaluations',
    detail: (id: number) => ({
      connectedDocuments: {
        root: `/api/evaluations/${id}/connected-documents`,
      },
    }),
  },
  datasets: {
    root: '/api/datasets',
  },
  evaluationTemplates: {
    root: '/api/evaluationTemplates',
  },
  documentLogs: {
    detail: ({ id }: { id: number }) => ({
      root: `/api/documentLogs/${id}`,
    }),
    uuids: {
      detail: ({ uuid }: { uuid: string }) => ({
        root: `/api/documentLogs/uuids/${uuid}`,
      }),
    },
  },
  documents: {
    detail: ({ projectId }: { projectId: number }) => {
      const documentsAtProject = `/api/documents/${projectId}`
      return {
        detail: ({ commitUuid }: { commitUuid: string }) => {
          const documentsAtCommit = `${documentsAtProject}/${commitUuid}`
          return {
            root: documentsAtCommit,
            detail: ({ documentUuid }: { documentUuid: string }) => {
              const documentRoot = `${documentsAtCommit}/${documentUuid}`
              return {
                evaluations: {
                  root: `${documentRoot}/evaluations`,
                },
                evaluationResultsByDocumentContent: {
                  detail: ({ evaluationId }: { evaluationId: number }) => ({
                    root: `${documentRoot}/evaluation-results-by-document-content/${evaluationId}`,
                  }),
                },
              }
            },
          }
        },
        forImport: {
          root: `${documentsAtProject}/for-import`,
        },
      }
    },
  },
}
