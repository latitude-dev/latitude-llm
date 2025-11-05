const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000 // 1 day in milliseconds

interface TokenCacheEntry {
  workspaceId: number
  rateLimit: number
  timestamp: number
}

const tokenCache = new Map<string, TokenCacheEntry>()

export function getFromTokenCache(token: string): {
  workspaceId: number
  rateLimit: number
} | null {
  const cached = tokenCache.get(token)
  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
    return {
      workspaceId: cached.workspaceId,
      rateLimit: cached.rateLimit,
    }
  }
  return null
}

export function setToTokenCache(
  token: string,
  data: {
    workspaceId: number
    rateLimit: number
  },
): void {
  tokenCache.set(token, {
    workspaceId: data.workspaceId,
    rateLimit: data.rateLimit,
    timestamp: Date.now(),
  })
}

export function getTokenCacheSize(): number {
  return tokenCache.size
}
