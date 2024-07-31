const ROUTES = {
  Base: '',
  Api: {
    Base: '/api',
    V1: {
      Base: '/v1',
      Documents: {
        Base: '/projects/:projectId/commits/:commitUuid/documents',
        Get: '/:documentPath{.+}',
        Run: '/run',
      },
    },
  },
}

export default ROUTES
