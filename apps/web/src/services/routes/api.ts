export const _API_ROUTES = {
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
                connectedEvaluations: {
                  root: `${documentRoot}/connected-evaluations`,
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
  evaluations: {
    root: '/api/evaluations',
    detail: ({ documentUuid }: { documentUuid: string }) => ({
      root: `/api/evaluations/${documentUuid}`,
    }),
  },
}
