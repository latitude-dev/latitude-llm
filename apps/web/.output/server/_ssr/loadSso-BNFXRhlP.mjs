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
var sso = {};
var httpAuthSchemeProvider = {};
var hasRequiredHttpAuthSchemeProvider;
function requireHttpAuthSchemeProvider() {
  if (hasRequiredHttpAuthSchemeProvider) return httpAuthSchemeProvider;
  hasRequiredHttpAuthSchemeProvider = 1;
  Object.defineProperty(httpAuthSchemeProvider, "__esModule", { value: true });
  httpAuthSchemeProvider.resolveHttpAuthSchemeConfig = httpAuthSchemeProvider.defaultSSOHttpAuthSchemeProvider = httpAuthSchemeProvider.defaultSSOHttpAuthSchemeParametersProvider = void 0;
  const core_1 = /* @__PURE__ */ requireDistCjs();
  const util_middleware_1 = require$$1;
  const defaultSSOHttpAuthSchemeParametersProvider = async (config, context, input) => {
    return {
      operation: (0, util_middleware_1.getSmithyContext)(context).operation,
      region: await (0, util_middleware_1.normalizeProvider)(config.region)() || (() => {
        throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
      })()
    };
  };
  httpAuthSchemeProvider.defaultSSOHttpAuthSchemeParametersProvider = defaultSSOHttpAuthSchemeParametersProvider;
  function createAwsAuthSigv4HttpAuthOption(authParameters) {
    return {
      schemeId: "aws.auth#sigv4",
      signingProperties: {
        name: "awsssoportal",
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
  const defaultSSOHttpAuthSchemeProvider = (authParameters) => {
    const options = [];
    switch (authParameters.operation) {
      case "GetRoleCredentials": {
        options.push(createSmithyApiNoAuthHttpAuthOption());
        break;
      }
      default: {
        options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
      }
    }
    return options;
  };
  httpAuthSchemeProvider.defaultSSOHttpAuthSchemeProvider = defaultSSOHttpAuthSchemeProvider;
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
  const a = true, b = "isSet", c = "booleanEquals", d = "error", e = "endpoint", f = "tree", g = "PartitionResult", h = "getAttr", i = { [u]: false, type: "string" }, j = { [u]: true, default: false, type: "boolean" }, k = { [x]: "Endpoint" }, l = { [v]: c, [w]: [{ [x]: "UseFIPS" }, true] }, m = { [v]: c, [w]: [{ [x]: "UseDualStack" }, true] }, n = {}, o = { [v]: h, [w]: [{ [x]: g }, "supportsFIPS"] }, p = { [x]: g }, q = { [v]: c, [w]: [true, { [v]: h, [w]: [p, "supportsDualStack"] }] }, r = [l], s = [m], t = [{ [x]: "Region" }];
  const _data = {
    version: "1.0",
    parameters: { Region: i, UseDualStack: j, UseFIPS: j, Endpoint: i },
    rules: [
      {
        conditions: [{ [v]: b, [w]: [k] }],
        rules: [
          { conditions: r, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: d },
          { conditions: s, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: d },
          { endpoint: { url: k, properties: n, headers: n }, type: e }
        ],
        type: f
      },
      {
        conditions: [{ [v]: b, [w]: t }],
        rules: [
          {
            conditions: [{ [v]: "aws.partition", [w]: t, assign: g }],
            rules: [
              {
                conditions: [l, m],
                rules: [
                  {
                    conditions: [{ [v]: c, [w]: [a, o] }, q],
                    rules: [
                      {
                        endpoint: {
                          url: "https://portal.sso-fips.{Region}.{PartitionResult#dualStackDnsSuffix}",
                          properties: n,
                          headers: n
                        },
                        type: e
                      }
                    ],
                    type: f
                  },
                  { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: d }
                ],
                type: f
              },
              {
                conditions: r,
                rules: [
                  {
                    conditions: [{ [v]: c, [w]: [o, a] }],
                    rules: [
                      {
                        conditions: [{ [v]: "stringEquals", [w]: [{ [v]: h, [w]: [p, "name"] }, "aws-us-gov"] }],
                        endpoint: { url: "https://portal.sso.{Region}.amazonaws.com", properties: n, headers: n },
                        type: e
                      },
                      {
                        endpoint: {
                          url: "https://portal.sso-fips.{Region}.{PartitionResult#dnsSuffix}",
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
                conditions: s,
                rules: [
                  {
                    conditions: [q],
                    rules: [
                      {
                        endpoint: {
                          url: "https://portal.sso.{Region}.{PartitionResult#dualStackDnsSuffix}",
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
                endpoint: { url: "https://portal.sso.{Region}.{PartitionResult#dnsSuffix}", properties: n, headers: n },
                type: e
              }
            ],
            type: f
          }
        ],
        type: f
      },
      { error: "Invalid Configuration: Missing Region", type: d }
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
var SSOServiceException = {};
var hasRequiredSSOServiceException;
function requireSSOServiceException() {
  if (hasRequiredSSOServiceException) return SSOServiceException;
  hasRequiredSSOServiceException = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.SSOServiceException = exports$1.__ServiceException = void 0;
    const smithy_client_1 = require$$10;
    Object.defineProperty(exports$1, "__ServiceException", { enumerable: true, get: function() {
      return smithy_client_1.ServiceException;
    } });
    class SSOServiceException2 extends smithy_client_1.ServiceException {
      constructor(options) {
        super(options);
        Object.setPrototypeOf(this, SSOServiceException2.prototype);
      }
    }
    exports$1.SSOServiceException = SSOServiceException2;
  })(SSOServiceException);
  return SSOServiceException;
}
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  Object.defineProperty(errors, "__esModule", { value: true });
  errors.UnauthorizedException = errors.TooManyRequestsException = errors.ResourceNotFoundException = errors.InvalidRequestException = void 0;
  const SSOServiceException_1 = /* @__PURE__ */ requireSSOServiceException();
  class InvalidRequestException extends SSOServiceException_1.SSOServiceException {
    name = "InvalidRequestException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "InvalidRequestException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, InvalidRequestException.prototype);
    }
  }
  errors.InvalidRequestException = InvalidRequestException;
  class ResourceNotFoundException extends SSOServiceException_1.SSOServiceException {
    name = "ResourceNotFoundException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "ResourceNotFoundException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
    }
  }
  errors.ResourceNotFoundException = ResourceNotFoundException;
  class TooManyRequestsException extends SSOServiceException_1.SSOServiceException {
    name = "TooManyRequestsException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "TooManyRequestsException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, TooManyRequestsException.prototype);
    }
  }
  errors.TooManyRequestsException = TooManyRequestsException;
  class UnauthorizedException extends SSOServiceException_1.SSOServiceException {
    name = "UnauthorizedException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "UnauthorizedException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, UnauthorizedException.prototype);
    }
  }
  errors.UnauthorizedException = UnauthorizedException;
  return errors;
}
var hasRequiredSchemas_0;
function requireSchemas_0() {
  if (hasRequiredSchemas_0) return schemas_0;
  hasRequiredSchemas_0 = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.GetRoleCredentials$ = exports$1.RoleCredentials$ = exports$1.GetRoleCredentialsResponse$ = exports$1.GetRoleCredentialsRequest$ = exports$1.errorTypeRegistries = exports$1.UnauthorizedException$ = exports$1.TooManyRequestsException$ = exports$1.ResourceNotFoundException$ = exports$1.InvalidRequestException$ = exports$1.SSOServiceException$ = void 0;
    const _ATT = "AccessTokenType";
    const _GRC = "GetRoleCredentials";
    const _GRCR = "GetRoleCredentialsRequest";
    const _GRCRe = "GetRoleCredentialsResponse";
    const _IRE = "InvalidRequestException";
    const _RC = "RoleCredentials";
    const _RNFE = "ResourceNotFoundException";
    const _SAKT = "SecretAccessKeyType";
    const _STT = "SessionTokenType";
    const _TMRE = "TooManyRequestsException";
    const _UE = "UnauthorizedException";
    const _aI = "accountId";
    const _aKI = "accessKeyId";
    const _aT = "accessToken";
    const _ai = "account_id";
    const _c = "client";
    const _e = "error";
    const _ex = "expiration";
    const _h = "http";
    const _hE = "httpError";
    const _hH = "httpHeader";
    const _hQ = "httpQuery";
    const _m = "message";
    const _rC = "roleCredentials";
    const _rN = "roleName";
    const _rn = "role_name";
    const _s = "smithy.ts.sdk.synthetic.com.amazonaws.sso";
    const _sAK = "secretAccessKey";
    const _sT = "sessionToken";
    const _xasbt = "x-amz-sso_bearer_token";
    const n0 = "com.amazonaws.sso";
    const schema_1 = /* @__PURE__ */ requireSchema();
    const errors_1 = /* @__PURE__ */ requireErrors();
    const SSOServiceException_1 = /* @__PURE__ */ requireSSOServiceException();
    const _s_registry = schema_1.TypeRegistry.for(_s);
    exports$1.SSOServiceException$ = [-3, _s, "SSOServiceException", 0, [], []];
    _s_registry.registerError(exports$1.SSOServiceException$, SSOServiceException_1.SSOServiceException);
    const n0_registry = schema_1.TypeRegistry.for(n0);
    exports$1.InvalidRequestException$ = [-3, n0, _IRE, { [_e]: _c, [_hE]: 400 }, [_m], [0]];
    n0_registry.registerError(exports$1.InvalidRequestException$, errors_1.InvalidRequestException);
    exports$1.ResourceNotFoundException$ = [-3, n0, _RNFE, { [_e]: _c, [_hE]: 404 }, [_m], [0]];
    n0_registry.registerError(exports$1.ResourceNotFoundException$, errors_1.ResourceNotFoundException);
    exports$1.TooManyRequestsException$ = [-3, n0, _TMRE, { [_e]: _c, [_hE]: 429 }, [_m], [0]];
    n0_registry.registerError(exports$1.TooManyRequestsException$, errors_1.TooManyRequestsException);
    exports$1.UnauthorizedException$ = [-3, n0, _UE, { [_e]: _c, [_hE]: 401 }, [_m], [0]];
    n0_registry.registerError(exports$1.UnauthorizedException$, errors_1.UnauthorizedException);
    exports$1.errorTypeRegistries = [_s_registry, n0_registry];
    var AccessTokenType = [0, n0, _ATT, 8, 0];
    var SecretAccessKeyType = [0, n0, _SAKT, 8, 0];
    var SessionTokenType = [0, n0, _STT, 8, 0];
    exports$1.GetRoleCredentialsRequest$ = [
      3,
      n0,
      _GRCR,
      0,
      [_rN, _aI, _aT],
      [
        [0, { [_hQ]: _rn }],
        [0, { [_hQ]: _ai }],
        [() => AccessTokenType, { [_hH]: _xasbt }]
      ],
      3
    ];
    exports$1.GetRoleCredentialsResponse$ = [
      3,
      n0,
      _GRCRe,
      0,
      [_rC],
      [[() => exports$1.RoleCredentials$, 0]]
    ];
    exports$1.RoleCredentials$ = [
      3,
      n0,
      _RC,
      0,
      [_aKI, _sAK, _sT, _ex],
      [0, [() => SecretAccessKeyType, 0], [() => SessionTokenType, 0], 1]
    ];
    exports$1.GetRoleCredentials$ = [
      9,
      n0,
      _GRC,
      { [_h]: ["GET", "/federation/credentials", 200] },
      () => exports$1.GetRoleCredentialsRequest$,
      () => exports$1.GetRoleCredentialsResponse$
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
      apiVersion: "2019-06-10",
      base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
      base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
      disableHostPrefix: config?.disableHostPrefix ?? false,
      endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
      extensions: config?.extensions ?? [],
      httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultSSOHttpAuthSchemeProvider,
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
        defaultNamespace: "com.amazonaws.sso",
        errorTypeRegistries: schemas_0_1.errorTypeRegistries,
        version: "2019-06-10",
        serviceTarget: "SWBPortalService"
      },
      serviceId: config?.serviceId ?? "SSO",
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
var hasRequiredSso;
function requireSso() {
  if (hasRequiredSso) return sso;
  hasRequiredSso = 1;
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
    var SSOServiceException2 = /* @__PURE__ */ requireSSOServiceException();
    const resolveClientEndpointParameters = (options) => {
      return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "awsssoportal"
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
          const index = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
          if (index === -1) {
            _httpAuthSchemes.push(httpAuthScheme);
          } else {
            _httpAuthSchemes.splice(index, 1, httpAuthScheme);
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
    class SSOClient2 extends smithyClient.Client {
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
          httpAuthSchemeParametersProvider: httpAuthSchemeProvider2.defaultSSOHttpAuthSchemeParametersProvider,
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
    class GetRoleCredentialsCommand2 extends smithyClient.Command.classBuilder().ep(commonParams).m(function(Command, cs, config, o) {
      return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
    }).s("SWBPortalService", "GetRoleCredentials", {}).n("SSOClient", "GetRoleCredentialsCommand").sc(schemas_02.GetRoleCredentials$).build() {
    }
    const commands = {
      GetRoleCredentialsCommand: GetRoleCredentialsCommand2
    };
    class SSO extends SSOClient2 {
    }
    smithyClient.createAggregatedClient(commands, SSO);
    exports$1.$Command = smithyClient.Command;
    exports$1.__Client = smithyClient.Client;
    exports$1.SSOServiceException = SSOServiceException2.SSOServiceException;
    exports$1.GetRoleCredentialsCommand = GetRoleCredentialsCommand2;
    exports$1.SSO = SSO;
    exports$1.SSOClient = SSOClient2;
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
  })(sso);
  return sso;
}
var ssoExports = /* @__PURE__ */ requireSso();
const GetRoleCredentialsCommand = ssoExports.GetRoleCredentialsCommand;
const SSOClient = ssoExports.SSOClient;
export {
  GetRoleCredentialsCommand,
  SSOClient
};
