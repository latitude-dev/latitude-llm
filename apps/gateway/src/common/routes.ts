const ROUTES = {
  Base: '',
  Api: {
    Base: '/api',
    V1: {
      Base: '/v1',
      Chats: {
        Base: '/chats',
        AddMessage: '/add-message',
      },
      Documents: {
        Base: '/projects/:projectId/commits/:commitUuid/documents',
        Get: '/:documentPath{.+}',
        Run: '/run',
      },
    },
  },
}

export default ROUTES
