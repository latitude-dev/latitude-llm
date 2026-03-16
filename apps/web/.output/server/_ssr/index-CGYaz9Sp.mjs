import { aO as getAugmentedNamespace, aP as distEs$2$1, aQ as distEs$1$1, aR as userAgentMiddleware, aS as resolveUserAgentConfig, aT as getUserAgentPlugin, aU as getUserAgentMiddlewareOptions, aV as DEFAULT_UA_APP_ID, aW as retryMiddlewareOptions, aX as retryMiddleware, aY as resolveRetryConfig, aZ as getRetryPlugin, a_ as getRetryAfterHint, a$ as NODE_RETRY_MODE_CONFIG_OPTIONS, b0 as NODE_MAX_ATTEMPT_CONFIG_OPTIONS, b1 as ENV_RETRY_MODE, b2 as ENV_MAX_ATTEMPTS, b3 as CONFIG_RETRY_MODE, b4 as CONFIG_MAX_ATTEMPTS, b5 as resolveRegionConfig, b6 as REGION_INI_NAME, b7 as REGION_ENV_NAME, b8 as NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS, b9 as NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS, ba as NODE_REGION_CONFIG_OPTIONS, bb as NODE_REGION_CONFIG_FILE_OPTIONS, bc as ENV_USE_FIPS_ENDPOINT, bd as ENV_USE_DUALSTACK_ENDPOINT, be as DEFAULT_USE_FIPS_ENDPOINT, bf as DEFAULT_USE_DUALSTACK_ENDPOINT, bg as CONFIG_USE_FIPS_ENDPOINT, bh as CONFIG_USE_DUALSTACK_ENDPOINT, bi as toEndpointV1$1, bj as resolveParams, bk as resolveEndpointConfig, bl as getEndpointPlugin, bm as getEndpointFromInstructions, bn as endpointMiddlewareOptions, bo as endpointMiddleware, bp as loggerMiddlewareOptions, bq as loggerMiddleware, br as getLoggerPlugin, bs as recursionDetectionMiddleware, bt as getRecursionDetectionPlugin, bu as distEs$f, ai as HttpRequest, bv as INVOCATION_ID_HEADER, bw as REQUEST_HEADER, bx as isRetryableByTrait, by as isClockSkewError, bz as isThrottlingError, bA as isTransientError, bB as MAXIMUM_RETRY_DELAY, bC as RETRY_MODES, bD as DEFAULT_MAX_ATTEMPTS, bE as v4, bF as asSdkError, bG as THROTTLING_RETRY_DELAY_BASE, bH as DEFAULT_RETRY_DELAY_BASE, bI as DefaultRateLimiter, bJ as normalizeProvider, bK as resolveAwsRegionExtensionConfiguration, bL as getAwsRegionExtensionConfiguration, bM as resolveDefaultsModeConfig, ad as loadConfig, bN as streamCollector$1, ag as NodeHttpHandler, bO as DEFAULT_REQUEST_TIMEOUT, bP as defaultUserAgent, bQ as crtAvailability, bR as createDefaultUserAgentProvider, bS as UA_APP_ID_INI_NAME, bT as UA_APP_ID_ENV_NAME, bU as NODE_APP_ID_CONFIG_OPTIONS, bV as calculateBodyLength, bW as TIMEOUT_RETRY_COST, bX as StandardRetryStrategy$1, bY as RETRY_COST, bZ as NO_RETRY_INCREMENT, b_ as INITIAL_RETRY_TOKENS, b$ as DEFAULT_RETRY_MODE, c0 as AdaptiveRetryStrategy$1, c1 as HttpResponse, c2 as distEs$e$1, c3 as buildQueryString, c4 as getTransformedHeaders, c5 as writeRequestBody, c6 as resolveEndpoint, c7 as isValidHostLabel, c8 as isIpAddress, c9 as customEndpointFunctions, ca as EndpointError, cb as EndpointCache, cc as useDefaultPartitionInfo, ac as parseUrl, cd as setPartitionInfo, ce as partition, cf as getUserAgentPrefix, cg as awsEndpointFunctions } from "./index-D2KejSDZ.mjs";
import http2, { constants } from "http2";
const distEs$e = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loadConfig
}, Symbol.toStringTag, { value: "Module" }));
class NodeHttp2ConnectionPool {
  sessions = [];
  constructor(sessions) {
    this.sessions = sessions ?? [];
  }
  poll() {
    if (this.sessions.length > 0) {
      return this.sessions.shift();
    }
  }
  offerLast(session) {
    this.sessions.push(session);
  }
  contains(session) {
    return this.sessions.includes(session);
  }
  remove(session) {
    this.sessions = this.sessions.filter((s) => s !== session);
  }
  [Symbol.iterator]() {
    return this.sessions[Symbol.iterator]();
  }
  destroy(connection) {
    for (const session of this.sessions) {
      if (session === connection) {
        if (!session.destroyed) {
          session.destroy();
        }
      }
    }
  }
}
class NodeHttp2ConnectionManager {
  constructor(config) {
    this.config = config;
    if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) {
      throw new RangeError("maxConcurrency must be greater than zero.");
    }
  }
  config;
  sessionCache = /* @__PURE__ */ new Map();
  lease(requestContext, connectionConfiguration) {
    const url = this.getUrlString(requestContext);
    const existingPool = this.sessionCache.get(url);
    if (existingPool) {
      const existingSession = existingPool.poll();
      if (existingSession && !this.config.disableConcurrency) {
        return existingSession;
      }
    }
    const session = http2.connect(url);
    if (this.config.maxConcurrency) {
      session.settings({ maxConcurrentStreams: this.config.maxConcurrency }, (err) => {
        if (err) {
          throw new Error("Fail to set maxConcurrentStreams to " + this.config.maxConcurrency + "when creating new session for " + requestContext.destination.toString());
        }
      });
    }
    session.unref();
    const destroySessionCb = () => {
      session.destroy();
      this.deleteSession(url, session);
    };
    session.on("goaway", destroySessionCb);
    session.on("error", destroySessionCb);
    session.on("frameError", destroySessionCb);
    session.on("close", () => this.deleteSession(url, session));
    if (connectionConfiguration.requestTimeout) {
      session.setTimeout(connectionConfiguration.requestTimeout, destroySessionCb);
    }
    const connectionPool = this.sessionCache.get(url) || new NodeHttp2ConnectionPool();
    connectionPool.offerLast(session);
    this.sessionCache.set(url, connectionPool);
    return session;
  }
  deleteSession(authority, session) {
    const existingConnectionPool = this.sessionCache.get(authority);
    if (!existingConnectionPool) {
      return;
    }
    if (!existingConnectionPool.contains(session)) {
      return;
    }
    existingConnectionPool.remove(session);
    this.sessionCache.set(authority, existingConnectionPool);
  }
  release(requestContext, session) {
    const cacheKey = this.getUrlString(requestContext);
    this.sessionCache.get(cacheKey)?.offerLast(session);
  }
  destroy() {
    for (const [key, connectionPool] of this.sessionCache) {
      for (const session of connectionPool) {
        if (!session.destroyed) {
          session.destroy();
        }
        connectionPool.remove(session);
      }
      this.sessionCache.delete(key);
    }
  }
  setMaxConcurrentStreams(maxConcurrentStreams) {
    if (maxConcurrentStreams && maxConcurrentStreams <= 0) {
      throw new RangeError("maxConcurrentStreams must be greater than zero.");
    }
    this.config.maxConcurrency = maxConcurrentStreams;
  }
  setDisableConcurrentStreams(disableConcurrentStreams) {
    this.config.disableConcurrency = disableConcurrentStreams;
  }
  getUrlString(request) {
    return request.destination.toString();
  }
}
class NodeHttp2Handler {
  config;
  configProvider;
  metadata = { handlerProtocol: "h2" };
  connectionManager = new NodeHttp2ConnectionManager({});
  static create(instanceOrOptions) {
    if (typeof instanceOrOptions?.handle === "function") {
      return instanceOrOptions;
    }
    return new NodeHttp2Handler(instanceOrOptions);
  }
  constructor(options) {
    this.configProvider = new Promise((resolve, reject) => {
      if (typeof options === "function") {
        options().then((opts) => {
          resolve(opts || {});
        }).catch(reject);
      } else {
        resolve(options || {});
      }
    });
  }
  destroy() {
    this.connectionManager.destroy();
  }
  async handle(request, { abortSignal, requestTimeout } = {}) {
    if (!this.config) {
      this.config = await this.configProvider;
      this.connectionManager.setDisableConcurrentStreams(this.config.disableConcurrentStreams || false);
      if (this.config.maxConcurrentStreams) {
        this.connectionManager.setMaxConcurrentStreams(this.config.maxConcurrentStreams);
      }
    }
    const { requestTimeout: configRequestTimeout, disableConcurrentStreams } = this.config;
    const effectiveRequestTimeout = requestTimeout ?? configRequestTimeout;
    return new Promise((_resolve, _reject) => {
      let fulfilled = false;
      let writeRequestBodyPromise = void 0;
      const resolve = async (arg) => {
        await writeRequestBodyPromise;
        _resolve(arg);
      };
      const reject = async (arg) => {
        await writeRequestBodyPromise;
        _reject(arg);
      };
      if (abortSignal?.aborted) {
        fulfilled = true;
        const abortError = new Error("Request aborted");
        abortError.name = "AbortError";
        reject(abortError);
        return;
      }
      const { hostname, method, port, protocol, query } = request;
      let auth = "";
      if (request.username != null || request.password != null) {
        const username = request.username ?? "";
        const password = request.password ?? "";
        auth = `${username}:${password}@`;
      }
      const authority = `${protocol}//${auth}${hostname}${port ? `:${port}` : ""}`;
      const requestContext = { destination: new URL(authority) };
      const session = this.connectionManager.lease(requestContext, {
        requestTimeout: this.config?.sessionTimeout,
        disableConcurrentStreams: disableConcurrentStreams || false
      });
      const rejectWithDestroy = (err) => {
        if (disableConcurrentStreams) {
          this.destroySession(session);
        }
        fulfilled = true;
        reject(err);
      };
      const queryString = buildQueryString(query || {});
      let path = request.path;
      if (queryString) {
        path += `?${queryString}`;
      }
      if (request.fragment) {
        path += `#${request.fragment}`;
      }
      const req = session.request({
        ...request.headers,
        [constants.HTTP2_HEADER_PATH]: path,
        [constants.HTTP2_HEADER_METHOD]: method
      });
      session.ref();
      req.on("response", (headers) => {
        const httpResponse = new HttpResponse({
          statusCode: headers[":status"] || -1,
          headers: getTransformedHeaders(headers),
          body: req
        });
        fulfilled = true;
        resolve({ response: httpResponse });
        if (disableConcurrentStreams) {
          session.close();
          this.connectionManager.deleteSession(authority, session);
        }
      });
      if (effectiveRequestTimeout) {
        req.setTimeout(effectiveRequestTimeout, () => {
          req.close();
          const timeoutError = new Error(`Stream timed out because of no activity for ${effectiveRequestTimeout} ms`);
          timeoutError.name = "TimeoutError";
          rejectWithDestroy(timeoutError);
        });
      }
      if (abortSignal) {
        const onAbort = () => {
          req.close();
          const abortError = new Error("Request aborted");
          abortError.name = "AbortError";
          rejectWithDestroy(abortError);
        };
        if (typeof abortSignal.addEventListener === "function") {
          const signal = abortSignal;
          signal.addEventListener("abort", onAbort, { once: true });
          req.once("close", () => signal.removeEventListener("abort", onAbort));
        } else {
          abortSignal.onabort = onAbort;
        }
      }
      req.on("frameError", (type, code, id) => {
        rejectWithDestroy(new Error(`Frame type id ${type} in stream id ${id} has failed with code ${code}.`));
      });
      req.on("error", rejectWithDestroy);
      req.on("aborted", () => {
        rejectWithDestroy(new Error(`HTTP/2 stream is abnormally aborted in mid-communication with result code ${req.rstCode}.`));
      });
      req.on("close", () => {
        session.unref();
        if (disableConcurrentStreams) {
          session.destroy();
        }
        if (!fulfilled) {
          rejectWithDestroy(new Error("Unexpected error: http2 request did not get a response"));
        }
      });
      writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout);
    });
  }
  updateHttpClientConfig(key, value) {
    this.config = void 0;
    this.configProvider = this.configProvider.then((config) => {
      return {
        ...config,
        [key]: value
      };
    });
  }
  httpHandlerConfigs() {
    return this.config ?? {};
  }
  destroySession(session) {
    if (!session.destroyed) {
      session.destroy();
    }
  }
}
const distEs$d = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  DEFAULT_REQUEST_TIMEOUT,
  NodeHttp2Handler,
  NodeHttpHandler,
  streamCollector: streamCollector$1
}, Symbol.toStringTag, { value: "Module" }));
const resolveEndpointRequiredConfig = (input) => {
  const { endpoint } = input;
  if (endpoint === void 0) {
    input.endpoint = async () => {
      throw new Error("@smithy/middleware-endpoint: (default endpointRuleSet) endpoint is not set - you must configure an endpoint.");
    };
  }
  return input;
};
const distEs$c = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  endpointMiddleware,
  endpointMiddlewareOptions,
  getEndpointFromInstructions,
  getEndpointPlugin,
  resolveEndpointConfig,
  resolveEndpointRequiredConfig,
  resolveParams,
  toEndpointV1: toEndpointV1$1
}, Symbol.toStringTag, { value: "Module" }));
const distEs$b = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getLoggerPlugin,
  loggerMiddleware,
  loggerMiddlewareOptions
}, Symbol.toStringTag, { value: "Module" }));
const distEs$a = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRecursionDetectionPlugin,
  recursionDetectionMiddleware
}, Symbol.toStringTag, { value: "Module" }));
const distEs$9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  EndpointCache,
  EndpointError,
  customEndpointFunctions,
  isIpAddress,
  isValidHostLabel,
  resolveEndpoint
}, Symbol.toStringTag, { value: "Module" }));
const resolveDefaultAwsRegionalEndpointsConfig = (input) => {
  if (typeof input.endpointProvider !== "function") {
    throw new Error("@aws-sdk/util-endpoint - endpointProvider and endpoint missing in config for this client.");
  }
  const { endpoint } = input;
  if (endpoint === void 0) {
    input.endpoint = async () => {
      return toEndpointV1(input.endpointProvider({
        Region: typeof input.region === "function" ? await input.region() : input.region,
        UseDualStack: typeof input.useDualstackEndpoint === "function" ? await input.useDualstackEndpoint() : input.useDualstackEndpoint,
        UseFIPS: typeof input.useFipsEndpoint === "function" ? await input.useFipsEndpoint() : input.useFipsEndpoint,
        Endpoint: void 0
      }, { logger: input.logger }));
    };
  }
  return input;
};
const toEndpointV1 = (endpoint) => parseUrl(endpoint.url);
const distEs$8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  EndpointError,
  awsEndpointFunctions,
  getUserAgentPrefix,
  isIpAddress,
  partition,
  resolveDefaultAwsRegionalEndpointsConfig,
  resolveEndpoint,
  setPartitionInfo,
  toEndpointV1,
  useDefaultPartitionInfo
}, Symbol.toStringTag, { value: "Module" }));
const distEs$7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  DEFAULT_UA_APP_ID,
  getUserAgentMiddlewareOptions,
  getUserAgentPlugin,
  resolveUserAgentConfig,
  userAgentMiddleware
}, Symbol.toStringTag, { value: "Module" }));
const resolveCustomEndpointsConfig = (input) => {
  const { tls, endpoint, urlParser, useDualstackEndpoint } = input;
  return Object.assign(input, {
    tls: tls ?? true,
    endpoint: normalizeProvider(typeof endpoint === "string" ? urlParser(endpoint) : endpoint),
    isCustomEndpoint: true,
    useDualstackEndpoint: normalizeProvider(useDualstackEndpoint ?? false)
  });
};
const getEndpointFromRegion = async (input) => {
  const { tls = true } = input;
  const region = await input.region();
  const dnsHostRegex = new RegExp(/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])$/);
  if (!dnsHostRegex.test(region)) {
    throw new Error("Invalid region in client config");
  }
  const useDualstackEndpoint = await input.useDualstackEndpoint();
  const useFipsEndpoint = await input.useFipsEndpoint();
  const { hostname } = await input.regionInfoProvider(region, { useDualstackEndpoint, useFipsEndpoint }) ?? {};
  if (!hostname) {
    throw new Error("Cannot resolve hostname from client config");
  }
  return input.urlParser(`${tls ? "https:" : "http:"}//${hostname}`);
};
const resolveEndpointsConfig = (input) => {
  const useDualstackEndpoint = normalizeProvider(input.useDualstackEndpoint ?? false);
  const { endpoint, useFipsEndpoint, urlParser, tls } = input;
  return Object.assign(input, {
    tls: tls ?? true,
    endpoint: endpoint ? normalizeProvider(typeof endpoint === "string" ? urlParser(endpoint) : endpoint) : () => getEndpointFromRegion({ ...input, useDualstackEndpoint, useFipsEndpoint }),
    isCustomEndpoint: !!endpoint,
    useDualstackEndpoint
  });
};
const getHostnameFromVariants = (variants = [], { useFipsEndpoint, useDualstackEndpoint }) => variants.find(({ tags }) => useFipsEndpoint === tags.includes("fips") && useDualstackEndpoint === tags.includes("dualstack"))?.hostname;
const getResolvedHostname = (resolvedRegion, { regionHostname, partitionHostname }) => regionHostname ? regionHostname : partitionHostname ? partitionHostname.replace("{region}", resolvedRegion) : void 0;
const getResolvedPartition = (region, { partitionHash }) => Object.keys(partitionHash || {}).find((key) => partitionHash[key].regions.includes(region)) ?? "aws";
const getResolvedSigningRegion = (hostname, { signingRegion, regionRegex, useFipsEndpoint }) => {
  if (signingRegion) {
    return signingRegion;
  } else if (useFipsEndpoint) {
    const regionRegexJs = regionRegex.replace("\\\\", "\\").replace(/^\^/g, "\\.").replace(/\$$/g, "\\.");
    const regionRegexmatchArray = hostname.match(regionRegexJs);
    if (regionRegexmatchArray) {
      return regionRegexmatchArray[0].slice(1, -1);
    }
  }
};
const getRegionInfo = (region, { useFipsEndpoint = false, useDualstackEndpoint = false, signingService, regionHash, partitionHash }) => {
  const partition2 = getResolvedPartition(region, { partitionHash });
  const resolvedRegion = region in regionHash ? region : partitionHash[partition2]?.endpoint ?? region;
  const hostnameOptions = { useFipsEndpoint, useDualstackEndpoint };
  const regionHostname = getHostnameFromVariants(regionHash[resolvedRegion]?.variants, hostnameOptions);
  const partitionHostname = getHostnameFromVariants(partitionHash[partition2]?.variants, hostnameOptions);
  const hostname = getResolvedHostname(resolvedRegion, { regionHostname, partitionHostname });
  if (hostname === void 0) {
    throw new Error(`Endpoint resolution failed for: ${{ resolvedRegion, useFipsEndpoint, useDualstackEndpoint }}`);
  }
  const signingRegion = getResolvedSigningRegion(hostname, {
    signingRegion: regionHash[resolvedRegion]?.signingRegion,
    regionRegex: partitionHash[partition2].regionRegex,
    useFipsEndpoint
  });
  return {
    partition: partition2,
    signingService,
    hostname,
    ...signingRegion && { signingRegion },
    ...regionHash[resolvedRegion]?.signingService && {
      signingService: regionHash[resolvedRegion].signingService
    }
  };
};
const distEs$6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  CONFIG_USE_DUALSTACK_ENDPOINT,
  CONFIG_USE_FIPS_ENDPOINT,
  DEFAULT_USE_DUALSTACK_ENDPOINT,
  DEFAULT_USE_FIPS_ENDPOINT,
  ENV_USE_DUALSTACK_ENDPOINT,
  ENV_USE_FIPS_ENDPOINT,
  NODE_REGION_CONFIG_FILE_OPTIONS,
  NODE_REGION_CONFIG_OPTIONS,
  NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS,
  NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS,
  REGION_ENV_NAME,
  REGION_INI_NAME,
  getRegionInfo,
  resolveCustomEndpointsConfig,
  resolveEndpointsConfig,
  resolveRegionConfig
}, Symbol.toStringTag, { value: "Module" }));
class ConfiguredRetryStrategy extends StandardRetryStrategy$1 {
  computeNextBackoffDelay;
  constructor(maxAttempts, computeNextBackoffDelay = DEFAULT_RETRY_DELAY_BASE) {
    super(typeof maxAttempts === "function" ? maxAttempts : async () => maxAttempts);
    if (typeof computeNextBackoffDelay === "number") {
      this.computeNextBackoffDelay = () => computeNextBackoffDelay;
    } else {
      this.computeNextBackoffDelay = computeNextBackoffDelay;
    }
  }
  async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
    const token = await super.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
    token.getRetryDelay = () => this.computeNextBackoffDelay(token.getRetryCount());
    return token;
  }
}
const distEs$5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AdaptiveRetryStrategy: AdaptiveRetryStrategy$1,
  ConfiguredRetryStrategy,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY_BASE,
  DEFAULT_RETRY_MODE,
  DefaultRateLimiter,
  INITIAL_RETRY_TOKENS,
  INVOCATION_ID_HEADER,
  MAXIMUM_RETRY_DELAY,
  NO_RETRY_INCREMENT,
  REQUEST_HEADER,
  RETRY_COST,
  get RETRY_MODES() {
    return RETRY_MODES;
  },
  StandardRetryStrategy: StandardRetryStrategy$1,
  THROTTLING_RETRY_DELAY_BASE,
  TIMEOUT_RETRY_COST
}, Symbol.toStringTag, { value: "Module" }));
const getDefaultRetryQuota = (initialRetryTokens, options) => {
  const MAX_CAPACITY = initialRetryTokens;
  const noRetryIncrement = NO_RETRY_INCREMENT;
  const retryCost = RETRY_COST;
  const timeoutRetryCost = TIMEOUT_RETRY_COST;
  let availableCapacity = initialRetryTokens;
  const getCapacityAmount = (error) => error.name === "TimeoutError" ? timeoutRetryCost : retryCost;
  const hasRetryTokens = (error) => getCapacityAmount(error) <= availableCapacity;
  const retrieveRetryTokens = (error) => {
    if (!hasRetryTokens(error)) {
      throw new Error("No retry token available");
    }
    const capacityAmount = getCapacityAmount(error);
    availableCapacity -= capacityAmount;
    return capacityAmount;
  };
  const releaseRetryTokens = (capacityReleaseAmount) => {
    availableCapacity += capacityReleaseAmount ?? noRetryIncrement;
    availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
  };
  return Object.freeze({
    hasRetryTokens,
    retrieveRetryTokens,
    releaseRetryTokens
  });
};
const defaultDelayDecider = (delayBase, attempts) => Math.floor(Math.min(MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));
const defaultRetryDecider = (error) => {
  if (!error) {
    return false;
  }
  return isRetryableByTrait(error) || isClockSkewError(error) || isThrottlingError(error) || isTransientError(error);
};
class StandardRetryStrategy {
  maxAttemptsProvider;
  retryDecider;
  delayDecider;
  retryQuota;
  mode = RETRY_MODES.STANDARD;
  constructor(maxAttemptsProvider, options) {
    this.maxAttemptsProvider = maxAttemptsProvider;
    this.retryDecider = options?.retryDecider ?? defaultRetryDecider;
    this.delayDecider = options?.delayDecider ?? defaultDelayDecider;
    this.retryQuota = options?.retryQuota ?? getDefaultRetryQuota(INITIAL_RETRY_TOKENS);
  }
  shouldRetry(error, attempts, maxAttempts) {
    return attempts < maxAttempts && this.retryDecider(error) && this.retryQuota.hasRetryTokens(error);
  }
  async getMaxAttempts() {
    let maxAttempts;
    try {
      maxAttempts = await this.maxAttemptsProvider();
    } catch (error) {
      maxAttempts = DEFAULT_MAX_ATTEMPTS;
    }
    return maxAttempts;
  }
  async retry(next, args, options) {
    let retryTokenAmount;
    let attempts = 0;
    let totalDelay = 0;
    const maxAttempts = await this.getMaxAttempts();
    const { request } = args;
    if (HttpRequest.isInstance(request)) {
      request.headers[INVOCATION_ID_HEADER] = v4();
    }
    while (true) {
      try {
        if (HttpRequest.isInstance(request)) {
          request.headers[REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
        }
        if (options?.beforeRequest) {
          await options.beforeRequest();
        }
        const { response, output } = await next(args);
        if (options?.afterRequest) {
          options.afterRequest(response);
        }
        this.retryQuota.releaseRetryTokens(retryTokenAmount);
        output.$metadata.attempts = attempts + 1;
        output.$metadata.totalRetryDelay = totalDelay;
        return { response, output };
      } catch (e) {
        const err = asSdkError(e);
        attempts++;
        if (this.shouldRetry(err, attempts, maxAttempts)) {
          retryTokenAmount = this.retryQuota.retrieveRetryTokens(err);
          const delayFromDecider = this.delayDecider(isThrottlingError(err) ? THROTTLING_RETRY_DELAY_BASE : DEFAULT_RETRY_DELAY_BASE, attempts);
          const delayFromResponse = getDelayFromRetryAfterHeader(err.$response);
          const delay = Math.max(delayFromResponse || 0, delayFromDecider);
          totalDelay += delay;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        if (!err.$metadata) {
          err.$metadata = {};
        }
        err.$metadata.attempts = attempts;
        err.$metadata.totalRetryDelay = totalDelay;
        throw err;
      }
    }
  }
}
const getDelayFromRetryAfterHeader = (response) => {
  if (!HttpResponse.isInstance(response))
    return;
  const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
  if (!retryAfterHeaderName)
    return;
  const retryAfter = response.headers[retryAfterHeaderName];
  const retryAfterSeconds = Number(retryAfter);
  if (!Number.isNaN(retryAfterSeconds))
    return retryAfterSeconds * 1e3;
  const retryAfterDate = new Date(retryAfter);
  return retryAfterDate.getTime() - Date.now();
};
class AdaptiveRetryStrategy extends StandardRetryStrategy {
  rateLimiter;
  constructor(maxAttemptsProvider, options) {
    const { rateLimiter, ...superOptions } = options ?? {};
    super(maxAttemptsProvider, superOptions);
    this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
    this.mode = RETRY_MODES.ADAPTIVE;
  }
  async retry(next, args) {
    return super.retry(next, args, {
      beforeRequest: async () => {
        return this.rateLimiter.getSendToken();
      },
      afterRequest: (response) => {
        this.rateLimiter.updateClientSendingRate(response);
      }
    });
  }
}
const omitRetryHeadersMiddleware = () => (next) => async (args) => {
  const { request } = args;
  if (HttpRequest.isInstance(request)) {
    delete request.headers[INVOCATION_ID_HEADER];
    delete request.headers[REQUEST_HEADER];
  }
  return next(args);
};
const omitRetryHeadersMiddlewareOptions = {
  name: "omitRetryHeadersMiddleware",
  tags: ["RETRY", "HEADERS", "OMIT_RETRY_HEADERS"],
  relation: "before",
  toMiddleware: "awsAuthMiddleware",
  override: true
};
const getOmitRetryHeadersPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.addRelativeTo(omitRetryHeadersMiddleware(), omitRetryHeadersMiddlewareOptions);
  }
});
const distEs$4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AdaptiveRetryStrategy,
  CONFIG_MAX_ATTEMPTS,
  CONFIG_RETRY_MODE,
  ENV_MAX_ATTEMPTS,
  ENV_RETRY_MODE,
  NODE_MAX_ATTEMPT_CONFIG_OPTIONS,
  NODE_RETRY_MODE_CONFIG_OPTIONS,
  StandardRetryStrategy,
  defaultDelayDecider,
  defaultRetryDecider,
  getOmitRetryHeadersPlugin,
  getRetryAfterHint,
  getRetryPlugin,
  omitRetryHeadersMiddleware,
  omitRetryHeadersMiddlewareOptions,
  resolveRetryConfig,
  retryMiddleware,
  retryMiddlewareOptions
}, Symbol.toStringTag, { value: "Module" }));
const distEs$3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  NODE_APP_ID_CONFIG_OPTIONS,
  UA_APP_ID_ENV_NAME,
  UA_APP_ID_INI_NAME,
  createDefaultUserAgentProvider,
  crtAvailability,
  defaultUserAgent
}, Symbol.toStringTag, { value: "Module" }));
const distEs$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  calculateBodyLength
}, Symbol.toStringTag, { value: "Module" }));
const distEs$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  resolveDefaultsModeConfig
}, Symbol.toStringTag, { value: "Module" }));
function stsRegionDefaultResolver(loaderConfig = {}) {
  return loadConfig({
    ...NODE_REGION_CONFIG_OPTIONS,
    async default() {
      if (!warning.silence) {
        console.warn("@aws-sdk - WARN - default STS region of us-east-1 used. See @aws-sdk/credential-providers README and set a region explicitly.");
      }
      return "us-east-1";
    }
  }, { ...NODE_REGION_CONFIG_FILE_OPTIONS, ...loaderConfig });
}
const warning = {
  silence: false
};
const distEs = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  NODE_REGION_CONFIG_FILE_OPTIONS,
  NODE_REGION_CONFIG_OPTIONS,
  REGION_ENV_NAME,
  REGION_INI_NAME,
  getAwsRegionExtensionConfiguration,
  resolveAwsRegionExtensionConfiguration,
  resolveRegionConfig,
  stsRegionDefaultResolver,
  warning
}, Symbol.toStringTag, { value: "Module" }));
const require$$0$1 = /* @__PURE__ */ getAugmentedNamespace(distEs$2$1);
const require$$1$2 = /* @__PURE__ */ getAugmentedNamespace(distEs$b);
const require$$2 = /* @__PURE__ */ getAugmentedNamespace(distEs$a);
const require$$3$1 = /* @__PURE__ */ getAugmentedNamespace(distEs$7);
const require$$4$1 = /* @__PURE__ */ getAugmentedNamespace(distEs$6);
const require$$7$1 = /* @__PURE__ */ getAugmentedNamespace(distEs$1$1);
const require$$8$1 = /* @__PURE__ */ getAugmentedNamespace(distEs$c);
const require$$9 = /* @__PURE__ */ getAugmentedNamespace(distEs$4);
const name = "@aws-sdk/nested-clients";
const version = "3.996.3";
const description = "Nested clients for AWS SDK packages.";
const main = "./dist-cjs/index.js";
const module$1 = "./dist-es/index.js";
const types = "./dist-types/index.d.ts";
const scripts = { "build": "yarn lint && concurrently 'yarn:build:types' 'yarn:build:es' && yarn build:cjs", "build:cjs": "node ../../scripts/compilation/inline nested-clients", "build:es": "tsc -p tsconfig.es.json", "build:include:deps": 'yarn g:turbo run build -F="$npm_package_name"', "build:types": "tsc -p tsconfig.types.json", "build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4", "clean": "premove dist-cjs dist-es dist-types tsconfig.cjs.tsbuildinfo tsconfig.es.tsbuildinfo tsconfig.types.tsbuildinfo", "lint": "node ../../scripts/validation/submodules-linter.js --pkg nested-clients", "test": "yarn g:vitest run", "test:watch": "yarn g:vitest watch" };
const engines = { "node": ">=20.0.0" };
const sideEffects = false;
const author = { "name": "AWS SDK for JavaScript Team", "url": "https://aws.amazon.com/javascript/" };
const license = "Apache-2.0";
const dependencies = { "@aws-crypto/sha256-browser": "5.2.0", "@aws-crypto/sha256-js": "5.2.0", "@aws-sdk/core": "^3.973.15", "@aws-sdk/middleware-host-header": "^3.972.6", "@aws-sdk/middleware-logger": "^3.972.6", "@aws-sdk/middleware-recursion-detection": "^3.972.6", "@aws-sdk/middleware-user-agent": "^3.972.15", "@aws-sdk/region-config-resolver": "^3.972.6", "@aws-sdk/types": "^3.973.4", "@aws-sdk/util-endpoints": "^3.996.3", "@aws-sdk/util-user-agent-browser": "^3.972.6", "@aws-sdk/util-user-agent-node": "^3.973.0", "@smithy/config-resolver": "^4.4.9", "@smithy/core": "^3.23.6", "@smithy/fetch-http-handler": "^5.3.11", "@smithy/hash-node": "^4.2.10", "@smithy/invalid-dependency": "^4.2.10", "@smithy/middleware-content-length": "^4.2.10", "@smithy/middleware-endpoint": "^4.4.20", "@smithy/middleware-retry": "^4.4.37", "@smithy/middleware-serde": "^4.2.11", "@smithy/middleware-stack": "^4.2.10", "@smithy/node-config-provider": "^4.3.10", "@smithy/node-http-handler": "^4.4.12", "@smithy/protocol-http": "^5.3.10", "@smithy/smithy-client": "^4.12.0", "@smithy/types": "^4.13.0", "@smithy/url-parser": "^4.2.10", "@smithy/util-base64": "^4.3.1", "@smithy/util-body-length-browser": "^4.2.1", "@smithy/util-body-length-node": "^4.2.2", "@smithy/util-defaults-mode-browser": "^4.3.36", "@smithy/util-defaults-mode-node": "^4.2.39", "@smithy/util-endpoints": "^3.3.1", "@smithy/util-middleware": "^4.2.10", "@smithy/util-retry": "^4.2.10", "@smithy/util-utf8": "^4.2.1", "tslib": "^2.6.2" };
const devDependencies = { "concurrently": "7.0.0", "downlevel-dts": "0.10.1", "premove": "4.0.0", "typescript": "~5.8.3" };
const typesVersions = { "<4.0": { "dist-types/*": ["dist-types/ts3.4/*"] } };
const files = ["./cognito-identity.d.ts", "./cognito-identity.js", "./signin.d.ts", "./signin.js", "./sso-oidc.d.ts", "./sso-oidc.js", "./sso.d.ts", "./sso.js", "./sts.d.ts", "./sts.js", "dist-*/**"];
const browser = { "./dist-es/submodules/signin/runtimeConfig": "./dist-es/submodules/signin/runtimeConfig.browser", "./dist-es/submodules/sso-oidc/runtimeConfig": "./dist-es/submodules/sso-oidc/runtimeConfig.browser", "./dist-es/submodules/sts/runtimeConfig": "./dist-es/submodules/sts/runtimeConfig.browser" };
const homepage = "https://github.com/aws/aws-sdk-js-v3/tree/main/packages/nested-clients";
const repository = { "type": "git", "url": "https://github.com/aws/aws-sdk-js-v3.git", "directory": "packages/nested-clients" };
const exports$1 = { "./package.json": "./package.json", "./sso-oidc": { "types": "./dist-types/submodules/sso-oidc/index.d.ts", "module": "./dist-es/submodules/sso-oidc/index.js", "node": "./dist-cjs/submodules/sso-oidc/index.js", "import": "./dist-es/submodules/sso-oidc/index.js", "require": "./dist-cjs/submodules/sso-oidc/index.js" }, "./sts": { "types": "./dist-types/submodules/sts/index.d.ts", "module": "./dist-es/submodules/sts/index.js", "node": "./dist-cjs/submodules/sts/index.js", "import": "./dist-es/submodules/sts/index.js", "require": "./dist-cjs/submodules/sts/index.js" }, "./signin": { "types": "./dist-types/submodules/signin/index.d.ts", "module": "./dist-es/submodules/signin/index.js", "node": "./dist-cjs/submodules/signin/index.js", "import": "./dist-es/submodules/signin/index.js", "require": "./dist-cjs/submodules/signin/index.js" }, "./cognito-identity": { "types": "./dist-types/submodules/cognito-identity/index.d.ts", "module": "./dist-es/submodules/cognito-identity/index.js", "node": "./dist-cjs/submodules/cognito-identity/index.js", "import": "./dist-es/submodules/cognito-identity/index.js", "require": "./dist-cjs/submodules/cognito-identity/index.js" }, "./sso": { "types": "./dist-types/submodules/sso/index.d.ts", "module": "./dist-es/submodules/sso/index.js", "node": "./dist-cjs/submodules/sso/index.js", "import": "./dist-es/submodules/sso/index.js", "require": "./dist-cjs/submodules/sso/index.js" } };
const require$$1$1 = {
  name,
  version,
  description,
  main,
  module: module$1,
  types,
  scripts,
  engines,
  sideEffects,
  author,
  license,
  dependencies,
  devDependencies,
  typesVersions,
  files,
  browser,
  "react-native": {},
  homepage,
  repository,
  exports: exports$1
};
const require$$3 = /* @__PURE__ */ getAugmentedNamespace(distEs$3);
const require$$5 = /* @__PURE__ */ getAugmentedNamespace(distEs$f);
const require$$7 = /* @__PURE__ */ getAugmentedNamespace(distEs$e);
const require$$8 = /* @__PURE__ */ getAugmentedNamespace(distEs$d);
const require$$10 = /* @__PURE__ */ getAugmentedNamespace(distEs$2);
const require$$11 = /* @__PURE__ */ getAugmentedNamespace(distEs$1);
const require$$12 = /* @__PURE__ */ getAugmentedNamespace(distEs$5);
const require$$4 = /* @__PURE__ */ getAugmentedNamespace(distEs$e$1);
const require$$0 = /* @__PURE__ */ getAugmentedNamespace(distEs$8);
const require$$1 = /* @__PURE__ */ getAugmentedNamespace(distEs$9);
const require$$13 = /* @__PURE__ */ getAugmentedNamespace(distEs);
export {
  require$$9 as a,
  require$$4$1 as b,
  require$$0$1 as c,
  require$$8$1 as d,
  require$$7$1 as e,
  require$$1$2 as f,
  require$$2 as g,
  require$$1$1 as h,
  require$$13 as i,
  require$$11 as j,
  require$$7 as k,
  require$$8 as l,
  require$$5 as m,
  require$$3 as n,
  require$$10 as o,
  require$$12 as p,
  require$$4 as q,
  require$$3$1 as r,
  require$$1 as s,
  require$$0 as t
};
