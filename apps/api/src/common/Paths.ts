/**
 * Express router paths go here.
 */

export default {
  Base: '',
  Api: {
    Base: '/api',
    V1: {
      Base: '/v1',
      Commits: {
        Base: '/commits',
        Prompt: '/:commitUuid/*',
      },
    },
  },
} as const
