const PRODUCTION_EXPORTER_URL = "https://ingest.latitude.so"

export function getExporterUrl() {
  return process.env.LATITUDE_TELEMETRY_URL ?? PRODUCTION_EXPORTER_URL
}
