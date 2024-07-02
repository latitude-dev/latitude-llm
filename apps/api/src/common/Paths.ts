/**
 * Express router paths go here.
 */

export default {
  Base: '',
  Api: {
    Base: '/api',
    V1: {
      Base: '/v1',
      Chat: {
        Base: '/chat',
        Completions: '/completions',
      },
    },
  },
} as const
