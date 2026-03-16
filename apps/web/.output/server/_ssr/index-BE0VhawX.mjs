import { r as require$$3$1, a as require$$9, b as require$$4$1, c as require$$0$1, d as require$$8$1, e as require$$7$1, f as require$$1$2, g as require$$2, h as require$$1$1, i as require$$13, j as require$$11, k as require$$7, l as require$$8, m as require$$5, n as require$$3, o as require$$10$1, p as require$$12, q as require$$4, s as require$$1$3, t as require$$0 } from "./index-CGYaz9Sp.mjs";
import { aF as require$$10, aG as requireSchema, aH as requireDistCjs$1, aI as requireTslib, aJ as require$$14, aK as requireDistCjs, aL as require$$1, ab as require$$6, aM as requireProtocols, aN as require$$5$1 } from "./index-D2KejSDZ.mjs";
import "http2";
import "./index.mjs";
import "node:async_hooks";
import "node:stream";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "../_libs/react.mjs";
import "../_libs/papaparse.mjs";
import "stream";
import "../_libs/tiny-warning.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "../_libs/isbot.mjs";
import "../_libs/zod.mjs";
import "events";
import "dns";
import "fs";
import "net";
import "tls";
import "path";
import "string_decoder";
import "http";
import "https";
import "child_process";
import "assert";
import "url";
import "tty";
import "buffer";
import "zlib";
import "node:os";
import "os";
import "node:crypto";
import "path/posix";
import "node:util";
import "fs/promises";
import "node:fs/promises";
import "node:process";
import "node:path";
import "node:fs";
import "node:zlib";
import "../_libs/effect.mjs";
function _mergeNamespaces$1(n, m) {
  for (var i = 0; i < m.length; i++) {
    const e = m[i];
    if (typeof e !== "string" && !Array.isArray(e)) {
      for (const k in e) {
        if (k !== "default" && !(k in n)) {
          const d = Object.getOwnPropertyDescriptor(e, k);
          if (d) {
            Object.defineProperty(n, k, d.get ? d : {
              enumerable: true,
              get: () => e[k]
            });
          }
        }
      }
    }
  }
  return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
}
var signin = {};
var httpAuthSchemeProvider = {};
var hasRequiredHttpAuthSchemeProvider;
function requireHttpAuthSchemeProvider() {
  if (hasRequiredHttpAuthSchemeProvider) return httpAuthSchemeProvider;
  hasRequiredHttpAuthSchemeProvider = 1;
  Object.defineProperty(httpAuthSchemeProvider, "__esModule", { value: true });
  httpAuthSchemeProvider.resolveHttpAuthSchemeConfig = httpAuthSchemeProvider.defaultSigninHttpAuthSchemeProvider = httpAuthSchemeProvider.defaultSigninHttpAuthSchemeParametersProvider = void 0;
  const core_1 = /* @__PURE__ */ requireDistCjs();
  const util_middleware_1 = require$$1;
  const defaultSigninHttpAuthSchemeParametersProvider = async (config, context, input) => {
    return {
      operation: (0, util_middleware_1.getSmithyContext)(context).operation,
      region: await (0, util_middleware_1.normalizeProvider)(config.region)() || (() => {
        throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
      })()
    };
  };
  httpAuthSchemeProvider.defaultSigninHttpAuthSchemeParametersProvider = defaultSigninHttpAuthSchemeParametersProvider;
  function createAwsAuthSigv4HttpAuthOption(authParameters) {
    return {
      schemeId: "aws.auth#sigv4",
      signingProperties: {
        name: "signin",
        region: authParameters.region
      },
      propertiesExtractor: (config, context) => ({
        signingProperties: {
          config,
          context
        }
      })
    };
  }
  function createSmithyApiNoAuthHttpAuthOption(authParameters) {
    return {
      schemeId: "smithy.api#noAuth"
    };
  }
  const defaultSigninHttpAuthSchemeProvider = (authParameters) => {
    const options = [];
    switch (authParameters.operation) {
      case "CreateOAuth2Token": {
        options.push(createSmithyApiNoAuthHttpAuthOption());
        break;
      }
      default: {
        options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
      }
    }
    return options;
  };
  httpAuthSchemeProvider.defaultSigninHttpAuthSchemeProvider = defaultSigninHttpAuthSchemeProvider;
  const resolveHttpAuthSchemeConfig = (config) => {
    const config_0 = (0, core_1.resolveAwsSdkSigV4Config)(config);
    return Object.assign(config_0, {
      authSchemePreference: (0, util_middleware_1.normalizeProvider)(config.authSchemePreference ?? [])
    });
  };
  httpAuthSchemeProvider.resolveHttpAuthSchemeConfig = resolveHttpAuthSchemeConfig;
  return httpAuthSchemeProvider;
}
var runtimeConfig = {};
var runtimeConfig_shared = {};
var endpointResolver = {};
var ruleset = {};
var hasRequiredRuleset;
function requireRuleset() {
  if (hasRequiredRuleset) return ruleset;
  hasRequiredRuleset = 1;
  Object.defineProperty(ruleset, "__esModule", { value: true });
  ruleset.ruleSet = void 0;
  const u = "required", v = "fn", w = "argv", x = "ref";
  const a = true, b = "isSet", c = "booleanEquals", d = "error", e = "endpoint", f = "tree", g = "PartitionResult", h = "stringEquals", i = { [u]: true, default: false, type: "boolean" }, j = { [u]: false, type: "string" }, k = { [x]: "Endpoint" }, l = { [v]: c, [w]: [{ [x]: "UseFIPS" }, true] }, m = { [v]: c, [w]: [{ [x]: "UseDualStack" }, true] }, n = {}, o = { [v]: "getAttr", [w]: [{ [x]: g }, "name"] }, p = { [v]: c, [w]: [{ [x]: "UseFIPS" }, false] }, q = { [v]: c, [w]: [{ [x]: "UseDualStack" }, false] }, r = { [v]: "getAttr", [w]: [{ [x]: g }, "supportsFIPS"] }, s = { [v]: c, [w]: [true, { [v]: "getAttr", [w]: [{ [x]: g }, "supportsDualStack"] }] }, t = [{ [x]: "Region" }];
  const _data = {
    version: "1.0",
    parameters: { UseDualStack: i, UseFIPS: i, Endpoint: j, Region: j },
    rules: [
      {
        conditions: [{ [v]: b, [w]: [k] }],
        rules: [
          { conditions: [l], error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: d },
          {
            rules: [
              {
                conditions: [m],
                error: "Invalid Configuration: Dualstack and custom endpoint are not supported",
                type: d
              },
              { endpoint: { url: k, properties: n, headers: n }, type: e }
            ],
            type: f
          }
        ],
        type: f
      },
      {
        rules: [
          {
            conditions: [{ [v]: b, [w]: t }],
            rules: [
              {
                conditions: [{ [v]: "aws.partition", [w]: t, assign: g }],
                rules: [
                  {
                    conditions: [{ [v]: h, [w]: [o, "aws"] }, p, q],
                    endpoint: { url: "https://{Region}.signin.aws.amazon.com", properties: n, headers: n },
                    type: e
                  },
                  {
                    conditions: [{ [v]: h, [w]: [o, "aws-cn"] }, p, q],
                    endpoint: { url: "https://{Region}.signin.amazonaws.cn", properties: n, headers: n },
                    type: e
                  },
                  {
                    conditions: [{ [v]: h, [w]: [o, "aws-us-gov"] }, p, q],
                    endpoint: { url: "https://{Region}.signin.amazonaws-us-gov.com", properties: n, headers: n },
                    type: e
                  },
                  {
                    conditions: [l, m],
                    rules: [
                      {
                        conditions: [{ [v]: c, [w]: [a, r] }, s],
                        rules: [
                          {
                            endpoint: {
                              url: "https://signin-fips.{Region}.{PartitionResult#dualStackDnsSuffix}",
                              properties: n,
                              headers: n
                            },
                            type: e
                          }
                        ],
                        type: f
                      },
                      {
                        error: "FIPS and DualStack are enabled, but this partition does not support one or both",
                        type: d
                      }
                    ],
                    type: f
                  },
                  {
                    conditions: [l, q],
                    rules: [
                      {
                        conditions: [{ [v]: c, [w]: [r, a] }],
                        rules: [
                          {
                            endpoint: {
                              url: "https://signin-fips.{Region}.{PartitionResult#dnsSuffix}",
                              properties: n,
                              headers: n
                            },
                            type: e
                          }
                        ],
                        type: f
                      },
                      { error: "FIPS is enabled but this partition does not support FIPS", type: d }
                    ],
                    type: f
                  },
                  {
                    conditions: [p, m],
                    rules: [
                      {
                        conditions: [s],
                        rules: [
                          {
                            endpoint: {
                              url: "https://signin.{Region}.{PartitionResult#dualStackDnsSuffix}",
                              properties: n,
                              headers: n
                            },
                            type: e
                          }
                        ],
                        type: f
                      },
                      { error: "DualStack is enabled but this partition does not support DualStack", type: d }
                    ],
                    type: f
                  },
                  {
                    endpoint: { url: "https://signin.{Region}.{PartitionResult#dnsSuffix}", properties: n, headers: n },
                    type: e
                  }
                ],
                type: f
              }
            ],
            type: f
          },
          { error: "Invalid Configuration: Missing Region", type: d }
        ],
        type: f
      }
    ]
  };
  ruleset.ruleSet = _data;
  return ruleset;
}
var hasRequiredEndpointResolver;
function requireEndpointResolver() {
  if (hasRequiredEndpointResolver) return endpointResolver;
  hasRequiredEndpointResolver = 1;
  Object.defineProperty(endpointResolver, "__esModule", { value: true });
  endpointResolver.defaultEndpointResolver = void 0;
  const util_endpoints_1 = require$$0;
  const util_endpoints_2 = require$$1$3;
  const ruleset_1 = /* @__PURE__ */ requireRuleset();
  const cache = new util_endpoints_2.EndpointCache({
    size: 50,
    params: ["Endpoint", "Region", "UseDualStack", "UseFIPS"]
  });
  const defaultEndpointResolver = (endpointParams, context = {}) => {
    return cache.get(endpointParams, () => (0, util_endpoints_2.resolveEndpoint)(ruleset_1.ruleSet, {
      endpointParams,
      logger: context.logger
    }));
  };
  endpointResolver.defaultEndpointResolver = defaultEndpointResolver;
  util_endpoints_2.customEndpointFunctions.aws = util_endpoints_1.awsEndpointFunctions;
  return endpointResolver;
}
var schemas_0 = {};
var errors = {};
var SigninServiceException = {};
var hasRequiredSigninServiceException;
function requireSigninServiceException() {
  if (hasRequiredSigninServiceException) return SigninServiceException;
  hasRequiredSigninServiceException = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.SigninServiceException = exports$1.__ServiceException = void 0;
    const smithy_client_1 = require$$10;
    Object.defineProperty(exports$1, "__ServiceException", { enumerable: true, get: function() {
      return smithy_client_1.ServiceException;
    } });
    class SigninServiceException2 extends smithy_client_1.ServiceException {
      constructor(options) {
        super(options);
        Object.setPrototypeOf(this, SigninServiceException2.prototype);
      }
    }
    exports$1.SigninServiceException = SigninServiceException2;
  })(SigninServiceException);
  return SigninServiceException;
}
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  Object.defineProperty(errors, "__esModule", { value: true });
  errors.ValidationException = errors.TooManyRequestsError = errors.InternalServerException = errors.AccessDeniedException = void 0;
  const SigninServiceException_1 = /* @__PURE__ */ requireSigninServiceException();
  class AccessDeniedException extends SigninServiceException_1.SigninServiceException {
    name = "AccessDeniedException";
    $fault = "client";
    error;
    constructor(opts) {
      super({
        name: "AccessDeniedException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, AccessDeniedException.prototype);
      this.error = opts.error;
    }
  }
  errors.AccessDeniedException = AccessDeniedException;
  class InternalServerException extends SigninServiceException_1.SigninServiceException {
    name = "InternalServerException";
    $fault = "server";
    error;
    constructor(opts) {
      super({
        name: "InternalServerException",
        $fault: "server",
        ...opts
      });
      Object.setPrototypeOf(this, InternalServerException.prototype);
      this.error = opts.error;
    }
  }
  errors.InternalServerException = InternalServerException;
  class TooManyRequestsError extends SigninServiceException_1.SigninServiceException {
    name = "TooManyRequestsError";
    $fault = "client";
    error;
    constructor(opts) {
      super({
        name: "TooManyRequestsError",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, TooManyRequestsError.prototype);
      this.error = opts.error;
    }
  }
  errors.TooManyRequestsError = TooManyRequestsError;
  class ValidationException extends SigninServiceException_1.SigninServiceException {
    name = "ValidationException";
    $fault = "client";
    error;
    constructor(opts) {
      super({
        name: "ValidationException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, ValidationException.prototype);
      this.error = opts.error;
    }
  }
  errors.ValidationException = ValidationException;
  return errors;
}
var hasRequiredSchemas_0;
function requireSchemas_0() {
  if (hasRequiredSchemas_0) return schemas_0;
  hasRequiredSchemas_0 = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.CreateOAuth2Token$ = exports$1.CreateOAuth2TokenResponseBody$ = exports$1.CreateOAuth2TokenResponse$ = exports$1.CreateOAuth2TokenRequestBody$ = exports$1.CreateOAuth2TokenRequest$ = exports$1.AccessToken$ = exports$1.errorTypeRegistries = exports$1.ValidationException$ = exports$1.TooManyRequestsError$ = exports$1.InternalServerException$ = exports$1.AccessDeniedException$ = exports$1.SigninServiceException$ = void 0;
    const _ADE = "AccessDeniedException";
    const _AT = "AccessToken";
    const _COAT = "CreateOAuth2Token";
    const _COATR = "CreateOAuth2TokenRequest";
    const _COATRB = "CreateOAuth2TokenRequestBody";
    const _COATRBr = "CreateOAuth2TokenResponseBody";
    const _COATRr = "CreateOAuth2TokenResponse";
    const _ISE = "InternalServerException";
    const _RT = "RefreshToken";
    const _TMRE = "TooManyRequestsError";
    const _VE = "ValidationException";
    const _aKI = "accessKeyId";
    const _aT = "accessToken";
    const _c = "client";
    const _cI = "clientId";
    const _cV = "codeVerifier";
    const _co = "code";
    const _e = "error";
    const _eI = "expiresIn";
    const _gT = "grantType";
    const _h = "http";
    const _hE = "httpError";
    const _iT = "idToken";
    const _jN = "jsonName";
    const _m = "message";
    const _rT = "refreshToken";
    const _rU = "redirectUri";
    const _s = "smithy.ts.sdk.synthetic.com.amazonaws.signin";
    const _sAK = "secretAccessKey";
    const _sT = "sessionToken";
    const _se = "server";
    const _tI = "tokenInput";
    const _tO = "tokenOutput";
    const _tT = "tokenType";
    const n0 = "com.amazonaws.signin";
    const schema_1 = /* @__PURE__ */ requireSchema();
    const errors_1 = /* @__PURE__ */ requireErrors();
    const SigninServiceException_1 = /* @__PURE__ */ requireSigninServiceException();
    const _s_registry = schema_1.TypeRegistry.for(_s);
    exports$1.SigninServiceException$ = [-3, _s, "SigninServiceException", 0, [], []];
    _s_registry.registerError(exports$1.SigninServiceException$, SigninServiceException_1.SigninServiceException);
    const n0_registry = schema_1.TypeRegistry.for(n0);
    exports$1.AccessDeniedException$ = [-3, n0, _ADE, { [_e]: _c }, [_e, _m], [0, 0], 2];
    n0_registry.registerError(exports$1.AccessDeniedException$, errors_1.AccessDeniedException);
    exports$1.InternalServerException$ = [-3, n0, _ISE, { [_e]: _se, [_hE]: 500 }, [_e, _m], [0, 0], 2];
    n0_registry.registerError(exports$1.InternalServerException$, errors_1.InternalServerException);
    exports$1.TooManyRequestsError$ = [-3, n0, _TMRE, { [_e]: _c, [_hE]: 429 }, [_e, _m], [0, 0], 2];
    n0_registry.registerError(exports$1.TooManyRequestsError$, errors_1.TooManyRequestsError);
    exports$1.ValidationException$ = [-3, n0, _VE, { [_e]: _c, [_hE]: 400 }, [_e, _m], [0, 0], 2];
    n0_registry.registerError(exports$1.ValidationException$, errors_1.ValidationException);
    exports$1.errorTypeRegistries = [_s_registry, n0_registry];
    var RefreshToken = [0, n0, _RT, 8, 0];
    exports$1.AccessToken$ = [
      3,
      n0,
      _AT,
      8,
      [_aKI, _sAK, _sT],
      [
        [0, { [_jN]: _aKI }],
        [0, { [_jN]: _sAK }],
        [0, { [_jN]: _sT }]
      ],
      3
    ];
    exports$1.CreateOAuth2TokenRequest$ = [
      3,
      n0,
      _COATR,
      0,
      [_tI],
      [[() => exports$1.CreateOAuth2TokenRequestBody$, 16]],
      1
    ];
    exports$1.CreateOAuth2TokenRequestBody$ = [
      3,
      n0,
      _COATRB,
      0,
      [_cI, _gT, _co, _rU, _cV, _rT],
      [
        [0, { [_jN]: _cI }],
        [0, { [_jN]: _gT }],
        0,
        [0, { [_jN]: _rU }],
        [0, { [_jN]: _cV }],
        [() => RefreshToken, { [_jN]: _rT }]
      ],
      2
    ];
    exports$1.CreateOAuth2TokenResponse$ = [
      3,
      n0,
      _COATRr,
      0,
      [_tO],
      [[() => exports$1.CreateOAuth2TokenResponseBody$, 16]],
      1
    ];
    exports$1.CreateOAuth2TokenResponseBody$ = [
      3,
      n0,
      _COATRBr,
      0,
      [_aT, _tT, _eI, _rT, _iT],
      [
        [() => exports$1.AccessToken$, { [_jN]: _aT }],
        [0, { [_jN]: _tT }],
        [1, { [_jN]: _eI }],
        [() => RefreshToken, { [_jN]: _rT }],
        [0, { [_jN]: _iT }]
      ],
      4
    ];
    exports$1.CreateOAuth2Token$ = [
      9,
      n0,
      _COAT,
      { [_h]: ["POST", "/v1/token", 200] },
      () => exports$1.CreateOAuth2TokenRequest$,
      () => exports$1.CreateOAuth2TokenResponse$
    ];
  })(schemas_0);
  return schemas_0;
}
var hasRequiredRuntimeConfig_shared;
function requireRuntimeConfig_shared() {
  if (hasRequiredRuntimeConfig_shared) return runtimeConfig_shared;
  hasRequiredRuntimeConfig_shared = 1;
  Object.defineProperty(runtimeConfig_shared, "__esModule", { value: true });
  runtimeConfig_shared.getRuntimeConfig = void 0;
  const core_1 = /* @__PURE__ */ requireDistCjs();
  const protocols_1 = /* @__PURE__ */ requireProtocols();
  const core_2 = /* @__PURE__ */ requireDistCjs$1();
  const smithy_client_1 = require$$10;
  const url_parser_1 = require$$4;
  const util_base64_1 = require$$5$1;
  const util_utf8_1 = require$$6;
  const httpAuthSchemeProvider_1 = /* @__PURE__ */ requireHttpAuthSchemeProvider();
  const endpointResolver_1 = /* @__PURE__ */ requireEndpointResolver();
  const schemas_0_1 = /* @__PURE__ */ requireSchemas_0();
  const getRuntimeConfig = (config) => {
    return {
      apiVersion: "2023-01-01",
      base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
      base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
      disableHostPrefix: config?.disableHostPrefix ?? false,
      endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
      extensions: config?.extensions ?? [],
      httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultSigninHttpAuthSchemeProvider,
      httpAuthSchemes: config?.httpAuthSchemes ?? [
        {
          schemeId: "aws.auth#sigv4",
          identityProvider: (ipc) => ipc.getIdentityProvider("aws.auth#sigv4"),
          signer: new core_1.AwsSdkSigV4Signer()
        },
        {
          schemeId: "smithy.api#noAuth",
          identityProvider: (ipc) => ipc.getIdentityProvider("smithy.api#noAuth") || (async () => ({})),
          signer: new core_2.NoAuthSigner()
        }
      ],
      logger: config?.logger ?? new smithy_client_1.NoOpLogger(),
      protocol: config?.protocol ?? protocols_1.AwsRestJsonProtocol,
      protocolSettings: config?.protocolSettings ?? {
        defaultNamespace: "com.amazonaws.signin",
        errorTypeRegistries: schemas_0_1.errorTypeRegistries,
        version: "2023-01-01",
        serviceTarget: "Signin"
      },
      serviceId: config?.serviceId ?? "Signin",
      urlParser: config?.urlParser ?? url_parser_1.parseUrl,
      utf8Decoder: config?.utf8Decoder ?? util_utf8_1.fromUtf8,
      utf8Encoder: config?.utf8Encoder ?? util_utf8_1.toUtf8
    };
  };
  runtimeConfig_shared.getRuntimeConfig = getRuntimeConfig;
  return runtimeConfig_shared;
}
var hasRequiredRuntimeConfig;
function requireRuntimeConfig() {
  if (hasRequiredRuntimeConfig) return runtimeConfig;
  hasRequiredRuntimeConfig = 1;
  Object.defineProperty(runtimeConfig, "__esModule", { value: true });
  runtimeConfig.getRuntimeConfig = void 0;
  const tslib_1 = /* @__PURE__ */ requireTslib();
  const package_json_1 = tslib_1.__importDefault(require$$1$1);
  const core_1 = /* @__PURE__ */ requireDistCjs();
  const util_user_agent_node_1 = require$$3;
  const config_resolver_1 = require$$4$1;
  const hash_node_1 = require$$5;
  const middleware_retry_1 = require$$9;
  const node_config_provider_1 = require$$7;
  const node_http_handler_1 = require$$8;
  const smithy_client_1 = require$$10;
  const util_body_length_node_1 = require$$10$1;
  const util_defaults_mode_node_1 = require$$11;
  const util_retry_1 = require$$12;
  const runtimeConfig_shared_1 = /* @__PURE__ */ requireRuntimeConfig_shared();
  const getRuntimeConfig = (config) => {
    (0, smithy_client_1.emitWarningIfUnsupportedVersion)(process.version);
    const defaultsMode = (0, util_defaults_mode_node_1.resolveDefaultsModeConfig)(config);
    const defaultConfigProvider = () => defaultsMode().then(smithy_client_1.loadConfigsForDefaultMode);
    const clientSharedValues = (0, runtimeConfig_shared_1.getRuntimeConfig)(config);
    (0, core_1.emitWarningIfUnsupportedVersion)(process.version);
    const loaderConfig = {
      profile: config?.profile,
      logger: clientSharedValues.logger
    };
    return {
      ...clientSharedValues,
      ...config,
      runtime: "node",
      defaultsMode,
      authSchemePreference: config?.authSchemePreference ?? (0, node_config_provider_1.loadConfig)(core_1.NODE_AUTH_SCHEME_PREFERENCE_OPTIONS, loaderConfig),
      bodyLengthChecker: config?.bodyLengthChecker ?? util_body_length_node_1.calculateBodyLength,
      defaultUserAgentProvider: config?.defaultUserAgentProvider ?? (0, util_user_agent_node_1.createDefaultUserAgentProvider)({ serviceId: clientSharedValues.serviceId, clientVersion: package_json_1.default.version }),
      maxAttempts: config?.maxAttempts ?? (0, node_config_provider_1.loadConfig)(middleware_retry_1.NODE_MAX_ATTEMPT_CONFIG_OPTIONS, config),
      region: config?.region ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_REGION_CONFIG_OPTIONS, { ...config_resolver_1.NODE_REGION_CONFIG_FILE_OPTIONS, ...loaderConfig }),
      requestHandler: node_http_handler_1.NodeHttpHandler.create(config?.requestHandler ?? defaultConfigProvider),
      retryMode: config?.retryMode ?? (0, node_config_provider_1.loadConfig)({
        ...middleware_retry_1.NODE_RETRY_MODE_CONFIG_OPTIONS,
        default: async () => (await defaultConfigProvider()).retryMode || util_retry_1.DEFAULT_RETRY_MODE
      }, config),
      sha256: config?.sha256 ?? hash_node_1.Hash.bind(null, "sha256"),
      streamCollector: config?.streamCollector ?? node_http_handler_1.streamCollector,
      useDualstackEndpoint: config?.useDualstackEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
      useFipsEndpoint: config?.useFipsEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
      userAgentAppId: config?.userAgentAppId ?? (0, node_config_provider_1.loadConfig)(util_user_agent_node_1.NODE_APP_ID_CONFIG_OPTIONS, loaderConfig)
    };
  };
  runtimeConfig.getRuntimeConfig = getRuntimeConfig;
  return runtimeConfig;
}
var hasRequiredSignin;
function requireSignin() {
  if (hasRequiredSignin) return signin;
  hasRequiredSignin = 1;
  (function(exports$1) {
    var middlewareHostHeader = require$$0$1;
    var middlewareLogger = require$$1$2;
    var middlewareRecursionDetection = require$$2;
    var middlewareUserAgent = require$$3$1;
    var configResolver = require$$4$1;
    var core = /* @__PURE__ */ requireDistCjs$1();
    var schema = /* @__PURE__ */ requireSchema();
    var middlewareContentLength = require$$7$1;
    var middlewareEndpoint = require$$8$1;
    var middlewareRetry = require$$9;
    var smithyClient = require$$10;
    var httpAuthSchemeProvider2 = /* @__PURE__ */ requireHttpAuthSchemeProvider();
    var runtimeConfig2 = /* @__PURE__ */ requireRuntimeConfig();
    var regionConfigResolver = require$$13;
    var protocolHttp = require$$14;
    var schemas_02 = /* @__PURE__ */ requireSchemas_0();
    var errors2 = /* @__PURE__ */ requireErrors();
    var SigninServiceException2 = /* @__PURE__ */ requireSigninServiceException();
    const resolveClientEndpointParameters = (options) => {
      return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "signin"
      });
    };
    const commonParams = {
      UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
      Endpoint: { type: "builtInParams", name: "endpoint" },
      Region: { type: "builtInParams", name: "region" },
      UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
    };
    const getHttpAuthExtensionConfiguration = (runtimeConfig3) => {
      const _httpAuthSchemes = runtimeConfig3.httpAuthSchemes;
      let _httpAuthSchemeProvider = runtimeConfig3.httpAuthSchemeProvider;
      let _credentials = runtimeConfig3.credentials;
      return {
        setHttpAuthScheme(httpAuthScheme) {
          const index2 = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
          if (index2 === -1) {
            _httpAuthSchemes.push(httpAuthScheme);
          } else {
            _httpAuthSchemes.splice(index2, 1, httpAuthScheme);
          }
        },
        httpAuthSchemes() {
          return _httpAuthSchemes;
        },
        setHttpAuthSchemeProvider(httpAuthSchemeProvider3) {
          _httpAuthSchemeProvider = httpAuthSchemeProvider3;
        },
        httpAuthSchemeProvider() {
          return _httpAuthSchemeProvider;
        },
        setCredentials(credentials) {
          _credentials = credentials;
        },
        credentials() {
          return _credentials;
        }
      };
    };
    const resolveHttpAuthRuntimeConfig = (config) => {
      return {
        httpAuthSchemes: config.httpAuthSchemes(),
        httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
        credentials: config.credentials()
      };
    };
    const resolveRuntimeExtensions = (runtimeConfig3, extensions) => {
      const extensionConfiguration = Object.assign(regionConfigResolver.getAwsRegionExtensionConfiguration(runtimeConfig3), smithyClient.getDefaultExtensionConfiguration(runtimeConfig3), protocolHttp.getHttpHandlerExtensionConfiguration(runtimeConfig3), getHttpAuthExtensionConfiguration(runtimeConfig3));
      extensions.forEach((extension) => extension.configure(extensionConfiguration));
      return Object.assign(runtimeConfig3, regionConfigResolver.resolveAwsRegionExtensionConfiguration(extensionConfiguration), smithyClient.resolveDefaultRuntimeConfig(extensionConfiguration), protocolHttp.resolveHttpHandlerRuntimeConfig(extensionConfiguration), resolveHttpAuthRuntimeConfig(extensionConfiguration));
    };
    class SigninClient extends smithyClient.Client {
      config;
      constructor(...[configuration]) {
        const _config_0 = runtimeConfig2.getRuntimeConfig(configuration || {});
        super(_config_0);
        this.initConfig = _config_0;
        const _config_1 = resolveClientEndpointParameters(_config_0);
        const _config_2 = middlewareUserAgent.resolveUserAgentConfig(_config_1);
        const _config_3 = middlewareRetry.resolveRetryConfig(_config_2);
        const _config_4 = configResolver.resolveRegionConfig(_config_3);
        const _config_5 = middlewareHostHeader.resolveHostHeaderConfig(_config_4);
        const _config_6 = middlewareEndpoint.resolveEndpointConfig(_config_5);
        const _config_7 = httpAuthSchemeProvider2.resolveHttpAuthSchemeConfig(_config_6);
        const _config_8 = resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        this.config = _config_8;
        this.middlewareStack.use(schema.getSchemaSerdePlugin(this.config));
        this.middlewareStack.use(middlewareUserAgent.getUserAgentPlugin(this.config));
        this.middlewareStack.use(middlewareRetry.getRetryPlugin(this.config));
        this.middlewareStack.use(middlewareContentLength.getContentLengthPlugin(this.config));
        this.middlewareStack.use(middlewareHostHeader.getHostHeaderPlugin(this.config));
        this.middlewareStack.use(middlewareLogger.getLoggerPlugin(this.config));
        this.middlewareStack.use(middlewareRecursionDetection.getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(core.getHttpAuthSchemeEndpointRuleSetPlugin(this.config, {
          httpAuthSchemeParametersProvider: httpAuthSchemeProvider2.defaultSigninHttpAuthSchemeParametersProvider,
          identityProviderConfigProvider: async (config) => new core.DefaultIdentityProviderConfig({
            "aws.auth#sigv4": config.credentials
          })
        }));
        this.middlewareStack.use(core.getHttpSigningPlugin(this.config));
      }
      destroy() {
        super.destroy();
      }
    }
    class CreateOAuth2TokenCommand extends smithyClient.Command.classBuilder().ep(commonParams).m(function(Command, cs, config, o) {
      return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
    }).s("Signin", "CreateOAuth2Token", {}).n("SigninClient", "CreateOAuth2TokenCommand").sc(schemas_02.CreateOAuth2Token$).build() {
    }
    const commands = {
      CreateOAuth2TokenCommand
    };
    class Signin extends SigninClient {
    }
    smithyClient.createAggregatedClient(commands, Signin);
    const OAuth2ErrorCode = {
      AUTHCODE_EXPIRED: "AUTHCODE_EXPIRED",
      INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
      INVALID_REQUEST: "INVALID_REQUEST",
      SERVER_ERROR: "server_error",
      TOKEN_EXPIRED: "TOKEN_EXPIRED",
      USER_CREDENTIALS_CHANGED: "USER_CREDENTIALS_CHANGED"
    };
    exports$1.$Command = smithyClient.Command;
    exports$1.__Client = smithyClient.Client;
    exports$1.SigninServiceException = SigninServiceException2.SigninServiceException;
    exports$1.CreateOAuth2TokenCommand = CreateOAuth2TokenCommand;
    exports$1.OAuth2ErrorCode = OAuth2ErrorCode;
    exports$1.Signin = Signin;
    exports$1.SigninClient = SigninClient;
    Object.prototype.hasOwnProperty.call(schemas_02, "__proto__") && !Object.prototype.hasOwnProperty.call(exports$1, "__proto__") && Object.defineProperty(exports$1, "__proto__", {
      enumerable: true,
      value: schemas_02["__proto__"]
    });
    Object.keys(schemas_02).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, k)) exports$1[k] = schemas_02[k];
    });
    Object.prototype.hasOwnProperty.call(errors2, "__proto__") && !Object.prototype.hasOwnProperty.call(exports$1, "__proto__") && Object.defineProperty(exports$1, "__proto__", {
      enumerable: true,
      value: errors2["__proto__"]
    });
    Object.keys(errors2).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, k)) exports$1[k] = errors2[k];
    });
  })(signin);
  return signin;
}
var signinExports = /* @__PURE__ */ requireSignin();
const index = /* @__PURE__ */ _mergeNamespaces$1({
  __proto__: null
}, [signinExports]);
export {
  index as i
};
