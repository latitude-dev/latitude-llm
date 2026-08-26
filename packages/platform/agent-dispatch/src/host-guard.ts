import { lookup } from "node:dns/promises"
import https from "node:https"
import { isIP } from "node:net"

export type HostLookup = (hostname: string) => Promise<readonly string[]>

const defaultHostLookup: HostLookup = async (hostname) => {
  const addresses = await lookup(hostname, { all: true })
  return addresses.map((entry) => entry.address)
}

const isPublicUnicastIpv4 = (ip: string): boolean => {
  const [a = -1, b = -1, c = -1] = ip.split(".").map(Number)
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a >= 224) return false
  return true
}

const V4_MAPPED_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

const isPublicUnicastIpv6 = (ip: string): boolean => {
  const mapped = V4_MAPPED_IPV6.exec(ip)
  if (mapped?.[1]) return isPublicUnicastIpv4(mapped[1])
  const [firstGroup = "", secondGroup = "0"] = ip.split(":")
  const first = Number.parseInt(firstGroup === "" ? "0" : firstGroup, 16)
  const second = Number.parseInt(secondGroup === "" ? "0" : secondGroup, 16)
  if (Number.isNaN(first) || Number.isNaN(second)) return false
  if (first < 0x2000 || first > 0x3fff) return false
  if (first === 0x2001 && second === 0xdb8) return false
  return true
}

export const isPublicUnicastIp = (ip: string): boolean => {
  const version = isIP(ip)
  if (version === 4) return isPublicUnicastIpv4(ip)
  if (version === 6) return isPublicUnicastIpv6(ip)
  return false
}

export interface ResolvedPublicWebhookTarget {
  readonly url: URL
  /** Public address to connect to; `fetch` would re-resolve the hostname and reopen DNS-rebinding. */
  readonly address: string
}

export const resolvePublicWebhookTarget = async (
  webhookUrl: string,
  lookupHost: HostLookup = defaultHostLookup,
): Promise<ResolvedPublicWebhookTarget> => {
  let url: URL
  try {
    url = new URL(webhookUrl)
  } catch {
    throw new Error("invalid_webhook_url")
  }
  if (url.protocol !== "https:") {
    throw new Error("webhook_url_not_https")
  }
  const addresses = await lookupHost(url.hostname)
  if (addresses.length === 0) {
    throw new Error("dns_resolution_failed")
  }
  const address = addresses.find((candidate) => isPublicUnicastIp(candidate))
  if (address === undefined) {
    throw new Error("webhook_host_resolved_to_non_public_ip")
  }
  return { url, address }
}

export const resolvePublicWebhookUrl = async (
  webhookUrl: string,
  lookupHost: HostLookup = defaultHostLookup,
): Promise<URL> => (await resolvePublicWebhookTarget(webhookUrl, lookupHost)).url

export interface PinnedHttpsResponse {
  readonly status: number
  readonly headers: Headers
  readonly body: ReadableStream<Uint8Array> | null
  text(): Promise<string>
}

export const postPinnedHttps = (
  target: ResolvedPublicWebhookTarget,
  init: { readonly headers: Record<string, string>; readonly body: string },
): Promise<PinnedHttpsResponse> =>
  new Promise((resolve, reject) => {
    const port = target.url.port ? Number(target.url.port) : 443
    const req = https.request(
      {
        host: target.address,
        port,
        path: `${target.url.pathname}${target.url.search}`,
        method: "POST",
        headers: {
          ...init.headers,
          Host: target.url.hostname,
          "Content-Length": Buffer.byteLength(init.body, "utf8"),
        },
        servername: target.url.hostname,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          const bytes = Buffer.concat(chunks)
          const headers = new Headers()
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue
            headers.set(key, Array.isArray(value) ? value.join(", ") : value)
          }
          const body =
            bytes.length === 0
              ? null
              : new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.enqueue(new Uint8Array(bytes))
                    controller.close()
                  },
                })
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body,
            text: async () => bytes.toString("utf8"),
          })
        })
      },
    )
    req.on("error", reject)
    req.write(init.body)
    req.end()
  })
