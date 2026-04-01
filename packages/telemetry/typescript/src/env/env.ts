const DEFAULT_EXPORTER_URL =
  {
    production: "https://ingest.latitude.so",
    development: "http://localhost:3002",
    test: "http://localhost:3002",
  }[process.env.NODE_ENV ?? "development"] ?? "http://localhost:3002"

function getExporterUrl() {
  if (process.env.LATITUDE_TELEMETRY_URL) {
    return process.env.LATITUDE_TELEMETRY_URL
  }

  return DEFAULT_EXPORTER_URL
}

export const env = { EXPORTER_URL: getExporterUrl() } as const
