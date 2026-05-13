export interface IngestEnv {
  Variables: {
    organizationId: string
    apiKeyId: string
    /**
     * Optional default project slug from the `X-Latitude-Project` header. The middleware
     * is best-effort — it never fails if the header is missing or the slug doesn't resolve.
     * Per-span resolution happens in the ingest use case.
     */
    defaultProjectSlug?: string
  }
}
