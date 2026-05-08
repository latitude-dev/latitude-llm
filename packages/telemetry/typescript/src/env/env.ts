const LOCAL_EXPORTER_URL = "http://localhost:3002"
const PRODUCTION_EXPORTER_URL = "https://ingest.latitude.so"

function getExporterUrl() {
  if (process.env.LATITUDE_TELEMETRY_URL) {
    return process.env.LATITUDE_TELEMETRY_URL
  }

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return LOCAL_EXPORTER_URL
  }

  return PRODUCTION_EXPORTER_URL
}

export const env = { EXPORTER_URL: getExporterUrl() } as const
