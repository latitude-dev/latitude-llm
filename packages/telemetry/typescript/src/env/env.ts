const PRODUCTION_EXPORTER_URL = "https://ingest.latitude.so"

export function getExporterUrl() {
  return process.env.LATITUDE_TELEMETRY_URL ?? PRODUCTION_EXPORTER_URL
}

export const env = { EXPORTER_URL: getExporterUrl() } as const
