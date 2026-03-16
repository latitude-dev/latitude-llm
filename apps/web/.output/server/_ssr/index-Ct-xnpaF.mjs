import { d as require$$8$1, r as require$$3$1, a as require$$9, b as require$$4$1, c as require$$0$1, e as require$$7$1, f as require$$1$2, g as require$$2, h as require$$1$1, i as require$$13, j as require$$11, k as require$$7, l as require$$8, m as require$$5, n as require$$3, o as require$$10$1, p as require$$12, q as require$$4, s as require$$1$3, t as require$$0 } from "./index-CGYaz9Sp.mjs";
import { aF as require$$10, aG as requireSchema, aH as requireDistCjs$1, ch as requireClient, aI as requireTslib, aK as requireDistCjs, aL as require$$1, aJ as require$$14, ab as require$$6, aM as requireProtocols, aN as require$$5$1 } from "./index-D2KejSDZ.mjs";
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
var sts = {};
var STSClient = {};
var httpAuthSchemeProvider = {};
var hasRequiredHttpAuthSchemeProvider;
function requireHttpAuthSchemeProvider() {
  if (hasRequiredHttpAuthSchemeProvider) return httpAuthSchemeProvider;
  hasRequiredHttpAuthSchemeProvider = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.resolveHttpAuthSchemeConfig = exports$1.resolveStsAuthConfig = exports$1.defaultSTSHttpAuthSchemeProvider = exports$1.defaultSTSHttpAuthSchemeParametersProvider = void 0;
    const core_1 = /* @__PURE__ */ requireDistCjs();
    const util_middleware_1 = require$$1;
    const STSClient_1 = /* @__PURE__ */ requireSTSClient();
    const defaultSTSHttpAuthSchemeParametersProvider = async (config, context, input) => {
      return {
        operation: (0, util_middleware_1.getSmithyContext)(context).operation,
        region: await (0, util_middleware_1.normalizeProvider)(config.region)() || (() => {
          throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
        })()
      };
    };
    exports$1.defaultSTSHttpAuthSchemeParametersProvider = defaultSTSHttpAuthSchemeParametersProvider;
    function createAwsAuthSigv4HttpAuthOption(authParameters) {
      return {
        schemeId: "aws.auth#sigv4",
        signingProperties: {
          name: "sts",
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
    const defaultSTSHttpAuthSchemeProvider = (authParameters) => {
      const options = [];
      switch (authParameters.operation) {
        case "AssumeRoleWithWebIdentity": {
          options.push(createSmithyApiNoAuthHttpAuthOption());
          break;
        }
        default: {
          options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
        }
      }
      return options;
    };
    exports$1.defaultSTSHttpAuthSchemeProvider = defaultSTSHttpAuthSchemeProvider;
    const resolveStsAuthConfig = (input) => Object.assign(input, {
      stsClientCtor: STSClient_1.STSClient
    });
    exports$1.resolveStsAuthConfig = resolveStsAuthConfig;
    const resolveHttpAuthSchemeConfig = (config) => {
      const config_0 = (0, exports$1.resolveStsAuthConfig)(config);
      const config_1 = (0, core_1.resolveAwsSdkSigV4Config)(config_0);
      return Object.assign(config_1, {
        authSchemePreference: (0, util_middleware_1.normalizeProvider)(config.authSchemePreference ?? [])
      });
    };
    exports$1.resolveHttpAuthSchemeConfig = resolveHttpAuthSchemeConfig;
  })(httpAuthSchemeProvider);
  return httpAuthSchemeProvider;
}
var EndpointParameters = {};
var hasRequiredEndpointParameters;
function requireEndpointParameters() {
  if (hasRequiredEndpointParameters) return EndpointParameters;
  hasRequiredEndpointParameters = 1;
  Object.defineProperty(EndpointParameters, "__esModule", { value: true });
  EndpointParameters.commonParams = EndpointParameters.resolveClientEndpointParameters = void 0;
  const resolveClientEndpointParameters = (options) => {
    return Object.assign(options, {
      useDualstackEndpoint: options.useDualstackEndpoint ?? false,
      useFipsEndpoint: options.useFipsEndpoint ?? false,
      useGlobalEndpoint: options.useGlobalEndpoint ?? false,
      defaultSigningName: "sts"
    });
  };
  EndpointParameters.resolveClientEndpointParameters = resolveClientEndpointParameters;
  EndpointParameters.commonParams = {
    UseGlobalEndpoint: { type: "builtInParams", name: "useGlobalEndpoint" },
    UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
    Endpoint: { type: "builtInParams", name: "endpoint" },
    Region: { type: "builtInParams", name: "region" },
    UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
  };
  return EndpointParameters;
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
  const F = "required", G = "type", H = "fn", I = "argv", J = "ref";
  const a = false, b = true, c = "booleanEquals", d = "stringEquals", e = "sigv4", f = "sts", g = "us-east-1", h = "endpoint", i = "https://sts.{Region}.{PartitionResult#dnsSuffix}", j = "tree", k = "error", l = "getAttr", m = { [F]: false, [G]: "string" }, n = { [F]: true, default: false, [G]: "boolean" }, o = { [J]: "Endpoint" }, p = { [H]: "isSet", [I]: [{ [J]: "Region" }] }, q = { [J]: "Region" }, r = { [H]: "aws.partition", [I]: [q], assign: "PartitionResult" }, s = { [J]: "UseFIPS" }, t = { [J]: "UseDualStack" }, u = {
    url: "https://sts.amazonaws.com",
    properties: { authSchemes: [{ name: e, signingName: f, signingRegion: g }] },
    headers: {}
  }, v = {}, w = { conditions: [{ [H]: d, [I]: [q, "aws-global"] }], [h]: u, [G]: h }, x = { [H]: c, [I]: [s, true] }, y = { [H]: c, [I]: [t, true] }, z = { [H]: l, [I]: [{ [J]: "PartitionResult" }, "supportsFIPS"] }, A = { [J]: "PartitionResult" }, B = { [H]: c, [I]: [true, { [H]: l, [I]: [A, "supportsDualStack"] }] }, C = [{ [H]: "isSet", [I]: [o] }], D = [x], E = [y];
  const _data = {
    version: "1.0",
    parameters: { Region: m, UseDualStack: n, UseFIPS: n, Endpoint: m, UseGlobalEndpoint: n },
    rules: [
      {
        conditions: [
          { [H]: c, [I]: [{ [J]: "UseGlobalEndpoint" }, b] },
          { [H]: "not", [I]: C },
          p,
          r,
          { [H]: c, [I]: [s, a] },
          { [H]: c, [I]: [t, a] }
        ],
        rules: [
          { conditions: [{ [H]: d, [I]: [q, "ap-northeast-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "ap-south-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "ap-southeast-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "ap-southeast-2"] }], endpoint: u, [G]: h },
          w,
          { conditions: [{ [H]: d, [I]: [q, "ca-central-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "eu-central-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "eu-north-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "eu-west-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "eu-west-2"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "eu-west-3"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "sa-east-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, g] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "us-east-2"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "us-west-1"] }], endpoint: u, [G]: h },
          { conditions: [{ [H]: d, [I]: [q, "us-west-2"] }], endpoint: u, [G]: h },
          {
            endpoint: {
              url: i,
              properties: { authSchemes: [{ name: e, signingName: f, signingRegion: "{Region}" }] },
              headers: v
            },
            [G]: h
          }
        ],
        [G]: j
      },
      {
        conditions: C,
        rules: [
          { conditions: D, error: "Invalid Configuration: FIPS and custom endpoint are not supported", [G]: k },
          { conditions: E, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", [G]: k },
          { endpoint: { url: o, properties: v, headers: v }, [G]: h }
        ],
        [G]: j
      },
      {
        conditions: [p],
        rules: [
          {
            conditions: [r],
            rules: [
              {
                conditions: [x, y],
                rules: [
                  {
                    conditions: [{ [H]: c, [I]: [b, z] }, B],
                    rules: [
                      {
                        endpoint: {
                          url: "https://sts-fips.{Region}.{PartitionResult#dualStackDnsSuffix}",
                          properties: v,
                          headers: v
                        },
                        [G]: h
                      }
                    ],
                    [G]: j
                  },
                  { error: "FIPS and DualStack are enabled, but this partition does not support one or both", [G]: k }
                ],
                [G]: j
              },
              {
                conditions: D,
                rules: [
                  {
                    conditions: [{ [H]: c, [I]: [z, b] }],
                    rules: [
                      {
                        conditions: [{ [H]: d, [I]: [{ [H]: l, [I]: [A, "name"] }, "aws-us-gov"] }],
                        endpoint: { url: "https://sts.{Region}.amazonaws.com", properties: v, headers: v },
                        [G]: h
                      },
                      {
                        endpoint: {
                          url: "https://sts-fips.{Region}.{PartitionResult#dnsSuffix}",
                          properties: v,
                          headers: v
                        },
                        [G]: h
                      }
                    ],
                    [G]: j
                  },
                  { error: "FIPS is enabled but this partition does not support FIPS", [G]: k }
                ],
                [G]: j
              },
              {
                conditions: E,
                rules: [
                  {
                    conditions: [B],
                    rules: [
                      {
                        endpoint: {
                          url: "https://sts.{Region}.{PartitionResult#dualStackDnsSuffix}",
                          properties: v,
                          headers: v
                        },
                        [G]: h
                      }
                    ],
                    [G]: j
                  },
                  { error: "DualStack is enabled but this partition does not support DualStack", [G]: k }
                ],
                [G]: j
              },
              w,
              { endpoint: { url: i, properties: v, headers: v }, [G]: h }
            ],
            [G]: j
          }
        ],
        [G]: j
      },
      { error: "Invalid Configuration: Missing Region", [G]: k }
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
    params: ["Endpoint", "Region", "UseDualStack", "UseFIPS", "UseGlobalEndpoint"]
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
var STSServiceException = {};
var hasRequiredSTSServiceException;
function requireSTSServiceException() {
  if (hasRequiredSTSServiceException) return STSServiceException;
  hasRequiredSTSServiceException = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.STSServiceException = exports$1.__ServiceException = void 0;
    const smithy_client_1 = require$$10;
    Object.defineProperty(exports$1, "__ServiceException", { enumerable: true, get: function() {
      return smithy_client_1.ServiceException;
    } });
    class STSServiceException2 extends smithy_client_1.ServiceException {
      constructor(options) {
        super(options);
        Object.setPrototypeOf(this, STSServiceException2.prototype);
      }
    }
    exports$1.STSServiceException = STSServiceException2;
  })(STSServiceException);
  return STSServiceException;
}
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  Object.defineProperty(errors, "__esModule", { value: true });
  errors.IDPCommunicationErrorException = errors.InvalidIdentityTokenException = errors.IDPRejectedClaimException = errors.RegionDisabledException = errors.PackedPolicyTooLargeException = errors.MalformedPolicyDocumentException = errors.ExpiredTokenException = void 0;
  const STSServiceException_1 = /* @__PURE__ */ requireSTSServiceException();
  class ExpiredTokenException extends STSServiceException_1.STSServiceException {
    name = "ExpiredTokenException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "ExpiredTokenException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, ExpiredTokenException.prototype);
    }
  }
  errors.ExpiredTokenException = ExpiredTokenException;
  class MalformedPolicyDocumentException extends STSServiceException_1.STSServiceException {
    name = "MalformedPolicyDocumentException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "MalformedPolicyDocumentException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, MalformedPolicyDocumentException.prototype);
    }
  }
  errors.MalformedPolicyDocumentException = MalformedPolicyDocumentException;
  class PackedPolicyTooLargeException extends STSServiceException_1.STSServiceException {
    name = "PackedPolicyTooLargeException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "PackedPolicyTooLargeException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, PackedPolicyTooLargeException.prototype);
    }
  }
  errors.PackedPolicyTooLargeException = PackedPolicyTooLargeException;
  class RegionDisabledException extends STSServiceException_1.STSServiceException {
    name = "RegionDisabledException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "RegionDisabledException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, RegionDisabledException.prototype);
    }
  }
  errors.RegionDisabledException = RegionDisabledException;
  class IDPRejectedClaimException extends STSServiceException_1.STSServiceException {
    name = "IDPRejectedClaimException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "IDPRejectedClaimException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, IDPRejectedClaimException.prototype);
    }
  }
  errors.IDPRejectedClaimException = IDPRejectedClaimException;
  class InvalidIdentityTokenException extends STSServiceException_1.STSServiceException {
    name = "InvalidIdentityTokenException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "InvalidIdentityTokenException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, InvalidIdentityTokenException.prototype);
    }
  }
  errors.InvalidIdentityTokenException = InvalidIdentityTokenException;
  class IDPCommunicationErrorException extends STSServiceException_1.STSServiceException {
    name = "IDPCommunicationErrorException";
    $fault = "client";
    constructor(opts) {
      super({
        name: "IDPCommunicationErrorException",
        $fault: "client",
        ...opts
      });
      Object.setPrototypeOf(this, IDPCommunicationErrorException.prototype);
    }
  }
  errors.IDPCommunicationErrorException = IDPCommunicationErrorException;
  return errors;
}
var hasRequiredSchemas_0;
function requireSchemas_0() {
  if (hasRequiredSchemas_0) return schemas_0;
  hasRequiredSchemas_0 = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.AssumeRoleWithWebIdentity$ = exports$1.AssumeRole$ = exports$1.Tag$ = exports$1.ProvidedContext$ = exports$1.PolicyDescriptorType$ = exports$1.Credentials$ = exports$1.AssumeRoleWithWebIdentityResponse$ = exports$1.AssumeRoleWithWebIdentityRequest$ = exports$1.AssumeRoleResponse$ = exports$1.AssumeRoleRequest$ = exports$1.AssumedRoleUser$ = exports$1.errorTypeRegistries = exports$1.RegionDisabledException$ = exports$1.PackedPolicyTooLargeException$ = exports$1.MalformedPolicyDocumentException$ = exports$1.InvalidIdentityTokenException$ = exports$1.IDPRejectedClaimException$ = exports$1.IDPCommunicationErrorException$ = exports$1.ExpiredTokenException$ = exports$1.STSServiceException$ = void 0;
    const _A = "Arn";
    const _AKI = "AccessKeyId";
    const _AR = "AssumeRole";
    const _ARI = "AssumedRoleId";
    const _ARR = "AssumeRoleRequest";
    const _ARRs = "AssumeRoleResponse";
    const _ARU = "AssumedRoleUser";
    const _ARWWI = "AssumeRoleWithWebIdentity";
    const _ARWWIR = "AssumeRoleWithWebIdentityRequest";
    const _ARWWIRs = "AssumeRoleWithWebIdentityResponse";
    const _Au = "Audience";
    const _C = "Credentials";
    const _CA = "ContextAssertion";
    const _DS = "DurationSeconds";
    const _E = "Expiration";
    const _EI = "ExternalId";
    const _ETE = "ExpiredTokenException";
    const _IDPCEE = "IDPCommunicationErrorException";
    const _IDPRCE = "IDPRejectedClaimException";
    const _IITE = "InvalidIdentityTokenException";
    const _K = "Key";
    const _MPDE = "MalformedPolicyDocumentException";
    const _P = "Policy";
    const _PA = "PolicyArns";
    const _PAr = "ProviderArn";
    const _PC = "ProvidedContexts";
    const _PCLT = "ProvidedContextsListType";
    const _PCr = "ProvidedContext";
    const _PDT = "PolicyDescriptorType";
    const _PI = "ProviderId";
    const _PPS = "PackedPolicySize";
    const _PPTLE = "PackedPolicyTooLargeException";
    const _Pr = "Provider";
    const _RA = "RoleArn";
    const _RDE = "RegionDisabledException";
    const _RSN = "RoleSessionName";
    const _SAK = "SecretAccessKey";
    const _SFWIT = "SubjectFromWebIdentityToken";
    const _SI = "SourceIdentity";
    const _SN = "SerialNumber";
    const _ST = "SessionToken";
    const _T = "Tags";
    const _TC = "TokenCode";
    const _TTK = "TransitiveTagKeys";
    const _Ta = "Tag";
    const _V = "Value";
    const _WIT = "WebIdentityToken";
    const _a = "arn";
    const _aKST = "accessKeySecretType";
    const _aQE = "awsQueryError";
    const _c = "client";
    const _cTT = "clientTokenType";
    const _e = "error";
    const _hE = "httpError";
    const _m = "message";
    const _pDLT = "policyDescriptorListType";
    const _s = "smithy.ts.sdk.synthetic.com.amazonaws.sts";
    const _tLT = "tagListType";
    const n0 = "com.amazonaws.sts";
    const schema_1 = /* @__PURE__ */ requireSchema();
    const errors_1 = /* @__PURE__ */ requireErrors();
    const STSServiceException_1 = /* @__PURE__ */ requireSTSServiceException();
    const _s_registry = schema_1.TypeRegistry.for(_s);
    exports$1.STSServiceException$ = [-3, _s, "STSServiceException", 0, [], []];
    _s_registry.registerError(exports$1.STSServiceException$, STSServiceException_1.STSServiceException);
    const n0_registry = schema_1.TypeRegistry.for(n0);
    exports$1.ExpiredTokenException$ = [
      -3,
      n0,
      _ETE,
      { [_aQE]: [`ExpiredTokenException`, 400], [_e]: _c, [_hE]: 400 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.ExpiredTokenException$, errors_1.ExpiredTokenException);
    exports$1.IDPCommunicationErrorException$ = [
      -3,
      n0,
      _IDPCEE,
      { [_aQE]: [`IDPCommunicationError`, 400], [_e]: _c, [_hE]: 400 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.IDPCommunicationErrorException$, errors_1.IDPCommunicationErrorException);
    exports$1.IDPRejectedClaimException$ = [
      -3,
      n0,
      _IDPRCE,
      { [_aQE]: [`IDPRejectedClaim`, 403], [_e]: _c, [_hE]: 403 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.IDPRejectedClaimException$, errors_1.IDPRejectedClaimException);
    exports$1.InvalidIdentityTokenException$ = [
      -3,
      n0,
      _IITE,
      { [_aQE]: [`InvalidIdentityToken`, 400], [_e]: _c, [_hE]: 400 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.InvalidIdentityTokenException$, errors_1.InvalidIdentityTokenException);
    exports$1.MalformedPolicyDocumentException$ = [
      -3,
      n0,
      _MPDE,
      { [_aQE]: [`MalformedPolicyDocument`, 400], [_e]: _c, [_hE]: 400 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.MalformedPolicyDocumentException$, errors_1.MalformedPolicyDocumentException);
    exports$1.PackedPolicyTooLargeException$ = [
      -3,
      n0,
      _PPTLE,
      { [_aQE]: [`PackedPolicyTooLarge`, 400], [_e]: _c, [_hE]: 400 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.PackedPolicyTooLargeException$, errors_1.PackedPolicyTooLargeException);
    exports$1.RegionDisabledException$ = [
      -3,
      n0,
      _RDE,
      { [_aQE]: [`RegionDisabledException`, 403], [_e]: _c, [_hE]: 403 },
      [_m],
      [0]
    ];
    n0_registry.registerError(exports$1.RegionDisabledException$, errors_1.RegionDisabledException);
    exports$1.errorTypeRegistries = [_s_registry, n0_registry];
    var accessKeySecretType = [0, n0, _aKST, 8, 0];
    var clientTokenType = [0, n0, _cTT, 8, 0];
    exports$1.AssumedRoleUser$ = [3, n0, _ARU, 0, [_ARI, _A], [0, 0], 2];
    exports$1.AssumeRoleRequest$ = [
      3,
      n0,
      _ARR,
      0,
      [_RA, _RSN, _PA, _P, _DS, _T, _TTK, _EI, _SN, _TC, _SI, _PC],
      [0, 0, () => policyDescriptorListType, 0, 1, () => tagListType, 64 | 0, 0, 0, 0, 0, () => ProvidedContextsListType],
      2
    ];
    exports$1.AssumeRoleResponse$ = [
      3,
      n0,
      _ARRs,
      0,
      [_C, _ARU, _PPS, _SI],
      [[() => exports$1.Credentials$, 0], () => exports$1.AssumedRoleUser$, 1, 0]
    ];
    exports$1.AssumeRoleWithWebIdentityRequest$ = [
      3,
      n0,
      _ARWWIR,
      0,
      [_RA, _RSN, _WIT, _PI, _PA, _P, _DS],
      [0, 0, [() => clientTokenType, 0], 0, () => policyDescriptorListType, 0, 1],
      3
    ];
    exports$1.AssumeRoleWithWebIdentityResponse$ = [
      3,
      n0,
      _ARWWIRs,
      0,
      [_C, _SFWIT, _ARU, _PPS, _Pr, _Au, _SI],
      [[() => exports$1.Credentials$, 0], 0, () => exports$1.AssumedRoleUser$, 1, 0, 0, 0]
    ];
    exports$1.Credentials$ = [
      3,
      n0,
      _C,
      0,
      [_AKI, _SAK, _ST, _E],
      [0, [() => accessKeySecretType, 0], 0, 4],
      4
    ];
    exports$1.PolicyDescriptorType$ = [3, n0, _PDT, 0, [_a], [0]];
    exports$1.ProvidedContext$ = [3, n0, _PCr, 0, [_PAr, _CA], [0, 0]];
    exports$1.Tag$ = [3, n0, _Ta, 0, [_K, _V], [0, 0], 2];
    var policyDescriptorListType = [1, n0, _pDLT, 0, () => exports$1.PolicyDescriptorType$];
    var ProvidedContextsListType = [1, n0, _PCLT, 0, () => exports$1.ProvidedContext$];
    var tagListType = [1, n0, _tLT, 0, () => exports$1.Tag$];
    exports$1.AssumeRole$ = [9, n0, _AR, 0, () => exports$1.AssumeRoleRequest$, () => exports$1.AssumeRoleResponse$];
    exports$1.AssumeRoleWithWebIdentity$ = [
      9,
      n0,
      _ARWWI,
      0,
      () => exports$1.AssumeRoleWithWebIdentityRequest$,
      () => exports$1.AssumeRoleWithWebIdentityResponse$
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
      apiVersion: "2011-06-15",
      base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
      base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
      disableHostPrefix: config?.disableHostPrefix ?? false,
      endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
      extensions: config?.extensions ?? [],
      httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultSTSHttpAuthSchemeProvider,
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
      protocol: config?.protocol ?? protocols_1.AwsQueryProtocol,
      protocolSettings: config?.protocolSettings ?? {
        defaultNamespace: "com.amazonaws.sts",
        errorTypeRegistries: schemas_0_1.errorTypeRegistries,
        xmlNamespace: "https://sts.amazonaws.com/doc/2011-06-15/",
        version: "2011-06-15",
        serviceTarget: "AWSSecurityTokenServiceV20110615"
      },
      serviceId: config?.serviceId ?? "STS",
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
  const core_2 = /* @__PURE__ */ requireDistCjs$1();
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
      httpAuthSchemes: config?.httpAuthSchemes ?? [
        {
          schemeId: "aws.auth#sigv4",
          identityProvider: (ipc) => ipc.getIdentityProvider("aws.auth#sigv4") || (async (idProps) => await config.credentialDefaultProvider(idProps?.__config || {})()),
          signer: new core_1.AwsSdkSigV4Signer()
        },
        {
          schemeId: "smithy.api#noAuth",
          identityProvider: (ipc) => ipc.getIdentityProvider("smithy.api#noAuth") || (async () => ({})),
          signer: new core_2.NoAuthSigner()
        }
      ],
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
var runtimeExtensions = {};
var httpAuthExtensionConfiguration = {};
var hasRequiredHttpAuthExtensionConfiguration;
function requireHttpAuthExtensionConfiguration() {
  if (hasRequiredHttpAuthExtensionConfiguration) return httpAuthExtensionConfiguration;
  hasRequiredHttpAuthExtensionConfiguration = 1;
  Object.defineProperty(httpAuthExtensionConfiguration, "__esModule", { value: true });
  httpAuthExtensionConfiguration.resolveHttpAuthRuntimeConfig = httpAuthExtensionConfiguration.getHttpAuthExtensionConfiguration = void 0;
  const getHttpAuthExtensionConfiguration = (runtimeConfig2) => {
    const _httpAuthSchemes = runtimeConfig2.httpAuthSchemes;
    let _httpAuthSchemeProvider = runtimeConfig2.httpAuthSchemeProvider;
    let _credentials = runtimeConfig2.credentials;
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
      setHttpAuthSchemeProvider(httpAuthSchemeProvider2) {
        _httpAuthSchemeProvider = httpAuthSchemeProvider2;
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
  httpAuthExtensionConfiguration.getHttpAuthExtensionConfiguration = getHttpAuthExtensionConfiguration;
  const resolveHttpAuthRuntimeConfig = (config) => {
    return {
      httpAuthSchemes: config.httpAuthSchemes(),
      httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
      credentials: config.credentials()
    };
  };
  httpAuthExtensionConfiguration.resolveHttpAuthRuntimeConfig = resolveHttpAuthRuntimeConfig;
  return httpAuthExtensionConfiguration;
}
var hasRequiredRuntimeExtensions;
function requireRuntimeExtensions() {
  if (hasRequiredRuntimeExtensions) return runtimeExtensions;
  hasRequiredRuntimeExtensions = 1;
  Object.defineProperty(runtimeExtensions, "__esModule", { value: true });
  runtimeExtensions.resolveRuntimeExtensions = void 0;
  const region_config_resolver_1 = require$$13;
  const protocol_http_1 = require$$14;
  const smithy_client_1 = require$$10;
  const httpAuthExtensionConfiguration_1 = /* @__PURE__ */ requireHttpAuthExtensionConfiguration();
  const resolveRuntimeExtensions = (runtimeConfig2, extensions) => {
    const extensionConfiguration = Object.assign((0, region_config_resolver_1.getAwsRegionExtensionConfiguration)(runtimeConfig2), (0, smithy_client_1.getDefaultExtensionConfiguration)(runtimeConfig2), (0, protocol_http_1.getHttpHandlerExtensionConfiguration)(runtimeConfig2), (0, httpAuthExtensionConfiguration_1.getHttpAuthExtensionConfiguration)(runtimeConfig2));
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return Object.assign(runtimeConfig2, (0, region_config_resolver_1.resolveAwsRegionExtensionConfiguration)(extensionConfiguration), (0, smithy_client_1.resolveDefaultRuntimeConfig)(extensionConfiguration), (0, protocol_http_1.resolveHttpHandlerRuntimeConfig)(extensionConfiguration), (0, httpAuthExtensionConfiguration_1.resolveHttpAuthRuntimeConfig)(extensionConfiguration));
  };
  runtimeExtensions.resolveRuntimeExtensions = resolveRuntimeExtensions;
  return runtimeExtensions;
}
var hasRequiredSTSClient;
function requireSTSClient() {
  if (hasRequiredSTSClient) return STSClient;
  hasRequiredSTSClient = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.STSClient = exports$1.__Client = void 0;
    const middleware_host_header_1 = require$$0$1;
    const middleware_logger_1 = require$$1$2;
    const middleware_recursion_detection_1 = require$$2;
    const middleware_user_agent_1 = require$$3$1;
    const config_resolver_1 = require$$4$1;
    const core_1 = /* @__PURE__ */ requireDistCjs$1();
    const schema_1 = /* @__PURE__ */ requireSchema();
    const middleware_content_length_1 = require$$7$1;
    const middleware_endpoint_1 = require$$8$1;
    const middleware_retry_1 = require$$9;
    const smithy_client_1 = require$$10;
    Object.defineProperty(exports$1, "__Client", { enumerable: true, get: function() {
      return smithy_client_1.Client;
    } });
    const httpAuthSchemeProvider_1 = /* @__PURE__ */ requireHttpAuthSchemeProvider();
    const EndpointParameters_1 = /* @__PURE__ */ requireEndpointParameters();
    const runtimeConfig_1 = /* @__PURE__ */ requireRuntimeConfig();
    const runtimeExtensions_1 = /* @__PURE__ */ requireRuntimeExtensions();
    class STSClient2 extends smithy_client_1.Client {
      config;
      constructor(...[configuration]) {
        const _config_0 = (0, runtimeConfig_1.getRuntimeConfig)(configuration || {});
        super(_config_0);
        this.initConfig = _config_0;
        const _config_1 = (0, EndpointParameters_1.resolveClientEndpointParameters)(_config_0);
        const _config_2 = (0, middleware_user_agent_1.resolveUserAgentConfig)(_config_1);
        const _config_3 = (0, middleware_retry_1.resolveRetryConfig)(_config_2);
        const _config_4 = (0, config_resolver_1.resolveRegionConfig)(_config_3);
        const _config_5 = (0, middleware_host_header_1.resolveHostHeaderConfig)(_config_4);
        const _config_6 = (0, middleware_endpoint_1.resolveEndpointConfig)(_config_5);
        const _config_7 = (0, httpAuthSchemeProvider_1.resolveHttpAuthSchemeConfig)(_config_6);
        const _config_8 = (0, runtimeExtensions_1.resolveRuntimeExtensions)(_config_7, configuration?.extensions || []);
        this.config = _config_8;
        this.middlewareStack.use((0, schema_1.getSchemaSerdePlugin)(this.config));
        this.middlewareStack.use((0, middleware_user_agent_1.getUserAgentPlugin)(this.config));
        this.middlewareStack.use((0, middleware_retry_1.getRetryPlugin)(this.config));
        this.middlewareStack.use((0, middleware_content_length_1.getContentLengthPlugin)(this.config));
        this.middlewareStack.use((0, middleware_host_header_1.getHostHeaderPlugin)(this.config));
        this.middlewareStack.use((0, middleware_logger_1.getLoggerPlugin)(this.config));
        this.middlewareStack.use((0, middleware_recursion_detection_1.getRecursionDetectionPlugin)(this.config));
        this.middlewareStack.use((0, core_1.getHttpAuthSchemeEndpointRuleSetPlugin)(this.config, {
          httpAuthSchemeParametersProvider: httpAuthSchemeProvider_1.defaultSTSHttpAuthSchemeParametersProvider,
          identityProviderConfigProvider: async (config) => new core_1.DefaultIdentityProviderConfig({
            "aws.auth#sigv4": config.credentials
          })
        }));
        this.middlewareStack.use((0, core_1.getHttpSigningPlugin)(this.config));
      }
      destroy() {
        super.destroy();
      }
    }
    exports$1.STSClient = STSClient2;
  })(STSClient);
  return STSClient;
}
var hasRequiredSts;
function requireSts() {
  if (hasRequiredSts) return sts;
  hasRequiredSts = 1;
  (function(exports$1) {
    var STSClient2 = /* @__PURE__ */ requireSTSClient();
    var smithyClient = require$$10;
    var middlewareEndpoint = require$$8$1;
    var EndpointParameters2 = /* @__PURE__ */ requireEndpointParameters();
    var schemas_02 = /* @__PURE__ */ requireSchemas_0();
    var errors2 = /* @__PURE__ */ requireErrors();
    var client = /* @__PURE__ */ requireClient();
    var regionConfigResolver = require$$13;
    var STSServiceException2 = /* @__PURE__ */ requireSTSServiceException();
    class AssumeRoleCommand extends smithyClient.Command.classBuilder().ep(EndpointParameters2.commonParams).m(function(Command, cs, config, o) {
      return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
    }).s("AWSSecurityTokenServiceV20110615", "AssumeRole", {}).n("STSClient", "AssumeRoleCommand").sc(schemas_02.AssumeRole$).build() {
    }
    class AssumeRoleWithWebIdentityCommand extends smithyClient.Command.classBuilder().ep(EndpointParameters2.commonParams).m(function(Command, cs, config, o) {
      return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
    }).s("AWSSecurityTokenServiceV20110615", "AssumeRoleWithWebIdentity", {}).n("STSClient", "AssumeRoleWithWebIdentityCommand").sc(schemas_02.AssumeRoleWithWebIdentity$).build() {
    }
    const commands = {
      AssumeRoleCommand,
      AssumeRoleWithWebIdentityCommand
    };
    class STS extends STSClient2.STSClient {
    }
    smithyClient.createAggregatedClient(commands, STS);
    const getAccountIdFromAssumedRoleUser = (assumedRoleUser) => {
      if (typeof assumedRoleUser?.Arn === "string") {
        const arnComponents = assumedRoleUser.Arn.split(":");
        if (arnComponents.length > 4 && arnComponents[4] !== "") {
          return arnComponents[4];
        }
      }
      return void 0;
    };
    const resolveRegion = async (_region, _parentRegion, credentialProviderLogger, loaderConfig = {}) => {
      const region = typeof _region === "function" ? await _region() : _region;
      const parentRegion = typeof _parentRegion === "function" ? await _parentRegion() : _parentRegion;
      let stsDefaultRegion = "";
      const resolvedRegion = region ?? parentRegion ?? (stsDefaultRegion = await regionConfigResolver.stsRegionDefaultResolver(loaderConfig)());
      credentialProviderLogger?.debug?.("@aws-sdk/client-sts::resolveRegion", "accepting first of:", `${region} (credential provider clientConfig)`, `${parentRegion} (contextual client)`, `${stsDefaultRegion} (STS default: AWS_REGION, profile region, or us-east-1)`);
      return resolvedRegion;
    };
    const getDefaultRoleAssumer$1 = (stsOptions, STSClient3) => {
      let stsClient;
      let closureSourceCreds;
      return async (sourceCreds, params) => {
        closureSourceCreds = sourceCreds;
        if (!stsClient) {
          const { logger = stsOptions?.parentClientConfig?.logger, profile = stsOptions?.parentClientConfig?.profile, region, requestHandler = stsOptions?.parentClientConfig?.requestHandler, credentialProviderLogger, userAgentAppId = stsOptions?.parentClientConfig?.userAgentAppId } = stsOptions;
          const resolvedRegion = await resolveRegion(region, stsOptions?.parentClientConfig?.region, credentialProviderLogger, {
            logger,
            profile
          });
          const isCompatibleRequestHandler = !isH2(requestHandler);
          stsClient = new STSClient3({
            ...stsOptions,
            userAgentAppId,
            profile,
            credentialDefaultProvider: () => async () => closureSourceCreds,
            region: resolvedRegion,
            requestHandler: isCompatibleRequestHandler ? requestHandler : void 0,
            logger
          });
        }
        const { Credentials, AssumedRoleUser } = await stsClient.send(new AssumeRoleCommand(params));
        if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretAccessKey) {
          throw new Error(`Invalid response from STS.assumeRole call with role ${params.RoleArn}`);
        }
        const accountId = getAccountIdFromAssumedRoleUser(AssumedRoleUser);
        const credentials = {
          accessKeyId: Credentials.AccessKeyId,
          secretAccessKey: Credentials.SecretAccessKey,
          sessionToken: Credentials.SessionToken,
          expiration: Credentials.Expiration,
          ...Credentials.CredentialScope && { credentialScope: Credentials.CredentialScope },
          ...accountId && { accountId }
        };
        client.setCredentialFeature(credentials, "CREDENTIALS_STS_ASSUME_ROLE", "i");
        return credentials;
      };
    };
    const getDefaultRoleAssumerWithWebIdentity$1 = (stsOptions, STSClient3) => {
      let stsClient;
      return async (params) => {
        if (!stsClient) {
          const { logger = stsOptions?.parentClientConfig?.logger, profile = stsOptions?.parentClientConfig?.profile, region, requestHandler = stsOptions?.parentClientConfig?.requestHandler, credentialProviderLogger, userAgentAppId = stsOptions?.parentClientConfig?.userAgentAppId } = stsOptions;
          const resolvedRegion = await resolveRegion(region, stsOptions?.parentClientConfig?.region, credentialProviderLogger, {
            logger,
            profile
          });
          const isCompatibleRequestHandler = !isH2(requestHandler);
          stsClient = new STSClient3({
            ...stsOptions,
            userAgentAppId,
            profile,
            region: resolvedRegion,
            requestHandler: isCompatibleRequestHandler ? requestHandler : void 0,
            logger
          });
        }
        const { Credentials, AssumedRoleUser } = await stsClient.send(new AssumeRoleWithWebIdentityCommand(params));
        if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretAccessKey) {
          throw new Error(`Invalid response from STS.assumeRoleWithWebIdentity call with role ${params.RoleArn}`);
        }
        const accountId = getAccountIdFromAssumedRoleUser(AssumedRoleUser);
        const credentials = {
          accessKeyId: Credentials.AccessKeyId,
          secretAccessKey: Credentials.SecretAccessKey,
          sessionToken: Credentials.SessionToken,
          expiration: Credentials.Expiration,
          ...Credentials.CredentialScope && { credentialScope: Credentials.CredentialScope },
          ...accountId && { accountId }
        };
        if (accountId) {
          client.setCredentialFeature(credentials, "RESOLVED_ACCOUNT_ID", "T");
        }
        client.setCredentialFeature(credentials, "CREDENTIALS_STS_ASSUME_ROLE_WEB_ID", "k");
        return credentials;
      };
    };
    const isH2 = (requestHandler) => {
      return requestHandler?.metadata?.handlerProtocol === "h2";
    };
    const getCustomizableStsClientCtor = (baseCtor, customizations) => {
      if (!customizations)
        return baseCtor;
      else
        return class CustomizableSTSClient extends baseCtor {
          constructor(config) {
            super(config);
            for (const customization of customizations) {
              this.middlewareStack.use(customization);
            }
          }
        };
    };
    const getDefaultRoleAssumer = (stsOptions = {}, stsPlugins) => getDefaultRoleAssumer$1(stsOptions, getCustomizableStsClientCtor(STSClient2.STSClient, stsPlugins));
    const getDefaultRoleAssumerWithWebIdentity = (stsOptions = {}, stsPlugins) => getDefaultRoleAssumerWithWebIdentity$1(stsOptions, getCustomizableStsClientCtor(STSClient2.STSClient, stsPlugins));
    const decorateDefaultCredentialProvider = (provider) => (input) => provider({
      roleAssumer: getDefaultRoleAssumer(input),
      roleAssumerWithWebIdentity: getDefaultRoleAssumerWithWebIdentity(input),
      ...input
    });
    exports$1.$Command = smithyClient.Command;
    exports$1.STSServiceException = STSServiceException2.STSServiceException;
    exports$1.AssumeRoleCommand = AssumeRoleCommand;
    exports$1.AssumeRoleWithWebIdentityCommand = AssumeRoleWithWebIdentityCommand;
    exports$1.STS = STS;
    exports$1.decorateDefaultCredentialProvider = decorateDefaultCredentialProvider;
    exports$1.getDefaultRoleAssumer = getDefaultRoleAssumer;
    exports$1.getDefaultRoleAssumerWithWebIdentity = getDefaultRoleAssumerWithWebIdentity;
    Object.prototype.hasOwnProperty.call(STSClient2, "__proto__") && !Object.prototype.hasOwnProperty.call(exports$1, "__proto__") && Object.defineProperty(exports$1, "__proto__", {
      enumerable: true,
      value: STSClient2["__proto__"]
    });
    Object.keys(STSClient2).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, k)) exports$1[k] = STSClient2[k];
    });
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
  })(sts);
  return sts;
}
var stsExports = /* @__PURE__ */ requireSts();
const index = /* @__PURE__ */ _mergeNamespaces$1({
  __proto__: null
}, [stsExports]);
export {
  index as i
};
