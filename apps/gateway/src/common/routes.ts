const ROUTES = {
  Base: '',
  Api: {
    Base: '/api',
    V1: {
      Base: '/v1',
      Conversations: {
        Base: '/conversations',
        Chat: '/:conversationUuid/chat',
      },
      Documents: {
        Base: '/projects/:projectId/versions/:versionUuid/documents',
        Get: '/:documentPath{.+}',
        Run: '/run',
      },
    },
  },
}

export default ROUTES
