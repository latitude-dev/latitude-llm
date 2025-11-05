export enum DocsRoute {
  Introduction = '/guides/getting-started/introduction',
  CoreConcepts = '/guides/getting-started/core-concepts',

  // Project
  Editor = '/guides/prompt-manager/overview',
  PromptConfig = '/guides/prompt-manager/configuration',
  Playground = '/guides/prompt-manager/playground',
  VersionControl = '/guides/prompt-manager/version-control',
  Agents = '/guides/prompt-manager/agents',
  Evaluations = '/guides/evaluations/overview',
  Publish = '/guides/integration/publishing-deployment',
  IntegrationOverview = '/guides/integration/overview',
  Logs = '/guides/getting-started/core-concepts#logs',

  // Settings
  ProductManagers = '/guides/getting-started/quick-start-pm',
  MCP = '/guides/integration/mcp-integrations',
  Providers = '/guides/getting-started/providers',
  Webhooks = '/guides/api/webhooks',
  Invite = '/guides/getting-started/invite-your-team',
  HttpApi = '/guides/api/api-access',

  // Others
  Datasets = '/guides/datasets/overview',
}

interface RouteNode {
  route?: DocsRoute
  children?: Record<string, RouteNode>
}

const routesTree: RouteNode = {
  route: DocsRoute.Introduction,
  children: {
    dashboard: {
      route: DocsRoute.Introduction,
    },
    projects: {
      children: {
        '[projectId]': {
          children: {
            versions: {
              children: {
                '[versionId]': {
                  children: {
                    documents: {
                      children: {
                        '[documentId]': {
                          route: DocsRoute.Editor,
                          children: {
                            evaluations: {
                              route: DocsRoute.Evaluations,
                            },
                            logs: {
                              route: DocsRoute.Logs,
                            },
                          },
                        },
                      },
                    },
                    overview: {
                      route: DocsRoute.CoreConcepts,
                    },
                    history: {
                      route: DocsRoute.VersionControl,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    datasets: {
      route: DocsRoute.Datasets,
    },
    settings: {
      route: DocsRoute.ProductManagers,
    },
  },
}

export function getRouteFromPathname(pathname: string): DocsRoute {
  const segments = pathname.split('/').filter(Boolean)
  let node: RouteNode = routesTree
  let lastRoute: DocsRoute = DocsRoute.Introduction

  for (const seg of segments) {
    if (!node?.children) break

    // 1) try literal match
    if (seg in node.children) {
      node = node.children[seg]!
    }
    // 2) otherwise pick the first dynamic child ([...])
    else {
      const dynKey = Object.keys(node.children).find(
        (key) => key.startsWith('[') && key.endsWith(']'),
      )
      if (!dynKey) break
      node = node.children[dynKey]!
    }

    if (node.route) {
      lastRoute = node.route
    }
  }

  return lastRoute
}
