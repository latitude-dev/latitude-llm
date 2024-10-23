export class LatitudeApiError extends Error {
  status: number
  statusText: string
  serverResponse: string

  constructor({
    status,
    statusText,
    serverResponse,
  }: {
    status: number
    statusText: string
    serverResponse: string
  }) {
    super(`Unexpected API Error: ${status} ${statusText}`)

    this.status = status
    this.statusText = statusText
    this.serverResponse = serverResponse
  }
}

