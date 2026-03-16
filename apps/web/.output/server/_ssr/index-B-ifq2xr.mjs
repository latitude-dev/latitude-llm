import { al as getProfileName, af as CredentialsProviderError, ah as clientExports, as as chain, am as readFile, ai as HttpRequest } from "./index-D2KejSDZ.mjs";
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { promises } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { p as parseKnownFiles } from "./parseKnownFiles-CIvFpGfE.mjs";
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
import "os";
import "path/posix";
import "node:util";
import "fs/promises";
import "node:fs/promises";
import "node:process";
import "node:zlib";
import "../_libs/effect.mjs";
const resolveCredentialSource = (credentialSource, profileName, logger) => {
  const sourceProvidersMap = {
    EcsContainer: async (options) => {
      const { fromHttp } = await import("./index-CMOTg3Xj.mjs");
      const { fromContainerMetadata } = await import("./index-CvWsS4-4.mjs");
      logger?.debug("@aws-sdk/credential-provider-ini - credential_source is EcsContainer");
      return async () => chain(fromHttp(options ?? {}), fromContainerMetadata(options))().then(setNamedProvider);
    },
    Ec2InstanceMetadata: async (options) => {
      logger?.debug("@aws-sdk/credential-provider-ini - credential_source is Ec2InstanceMetadata");
      const { fromInstanceMetadata } = await import("./index-CvWsS4-4.mjs");
      return async () => fromInstanceMetadata(options)().then(setNamedProvider);
    },
    Environment: async (options) => {
      logger?.debug("@aws-sdk/credential-provider-ini - credential_source is Environment");
      const { fromEnv } = await import("./index-D2KejSDZ.mjs").then(function(n) {
        return n.ci;
      });
      return async () => fromEnv(options)().then(setNamedProvider);
    }
  };
  if (credentialSource in sourceProvidersMap) {
    return sourceProvidersMap[credentialSource];
  } else {
    throw new CredentialsProviderError(`Unsupported credential source in profile ${profileName}. Got ${credentialSource}, expected EcsContainer or Ec2InstanceMetadata or Environment.`, { logger });
  }
};
const setNamedProvider = (creds) => clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_NAMED_PROVIDER", "p");
const isAssumeRoleProfile = (arg, { profile = "default", logger } = {}) => {
  return Boolean(arg) && typeof arg === "object" && typeof arg.role_arn === "string" && ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1 && ["undefined", "string"].indexOf(typeof arg.external_id) > -1 && ["undefined", "string"].indexOf(typeof arg.mfa_serial) > -1 && (isAssumeRoleWithSourceProfile(arg, { profile, logger }) || isCredentialSourceProfile(arg, { profile, logger }));
};
const isAssumeRoleWithSourceProfile = (arg, { profile, logger }) => {
  const withSourceProfile = typeof arg.source_profile === "string" && typeof arg.credential_source === "undefined";
  if (withSourceProfile) {
    logger?.debug?.(`    ${profile} isAssumeRoleWithSourceProfile source_profile=${arg.source_profile}`);
  }
  return withSourceProfile;
};
const isCredentialSourceProfile = (arg, { profile, logger }) => {
  const withProviderProfile = typeof arg.credential_source === "string" && typeof arg.source_profile === "undefined";
  if (withProviderProfile) {
    logger?.debug?.(`    ${profile} isCredentialSourceProfile credential_source=${arg.credential_source}`);
  }
  return withProviderProfile;
};
const resolveAssumeRoleCredentials = async (profileName, profiles, options, callerClientConfig, visitedProfiles = {}, resolveProfileData2) => {
  options.logger?.debug("@aws-sdk/credential-provider-ini - resolveAssumeRoleCredentials (STS)");
  const profileData = profiles[profileName];
  const { source_profile, region } = profileData;
  if (!options.roleAssumer) {
    const { getDefaultRoleAssumer } = await import("./index-Ct-xnpaF.mjs").then((n) => n.i);
    options.roleAssumer = getDefaultRoleAssumer({
      ...options.clientConfig,
      credentialProviderLogger: options.logger,
      parentClientConfig: {
        ...callerClientConfig,
        ...options?.parentClientConfig,
        region: region ?? options?.parentClientConfig?.region ?? callerClientConfig?.region
      }
    }, options.clientPlugins);
  }
  if (source_profile && source_profile in visitedProfiles) {
    throw new CredentialsProviderError(`Detected a cycle attempting to resolve credentials for profile ${getProfileName(options)}. Profiles visited: ` + Object.keys(visitedProfiles).join(", "), { logger: options.logger });
  }
  options.logger?.debug(`@aws-sdk/credential-provider-ini - finding credential resolver using ${source_profile ? `source_profile=[${source_profile}]` : `profile=[${profileName}]`}`);
  const sourceCredsProvider = source_profile ? resolveProfileData2(source_profile, profiles, options, callerClientConfig, {
    ...visitedProfiles,
    [source_profile]: true
  }, isCredentialSourceWithoutRoleArn(profiles[source_profile] ?? {})) : (await resolveCredentialSource(profileData.credential_source, profileName, options.logger)(options))();
  if (isCredentialSourceWithoutRoleArn(profileData)) {
    return sourceCredsProvider.then((creds) => clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SOURCE_PROFILE", "o"));
  } else {
    const params = {
      RoleArn: profileData.role_arn,
      RoleSessionName: profileData.role_session_name || `aws-sdk-js-${Date.now()}`,
      ExternalId: profileData.external_id,
      DurationSeconds: parseInt(profileData.duration_seconds || "3600", 10)
    };
    const { mfa_serial } = profileData;
    if (mfa_serial) {
      if (!options.mfaCodeProvider) {
        throw new CredentialsProviderError(`Profile ${profileName} requires multi-factor authentication, but no MFA code callback was provided.`, { logger: options.logger, tryNextLink: false });
      }
      params.SerialNumber = mfa_serial;
      params.TokenCode = await options.mfaCodeProvider(mfa_serial);
    }
    const sourceCreds = await sourceCredsProvider;
    return options.roleAssumer(sourceCreds, params).then((creds) => clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SOURCE_PROFILE", "o"));
  }
};
const isCredentialSourceWithoutRoleArn = (section) => {
  return !section.role_arn && !!section.credential_source;
};
class LoginCredentialsFetcher {
  profileData;
  init;
  callerClientConfig;
  static REFRESH_THRESHOLD = 5 * 60 * 1e3;
  constructor(profileData, init, callerClientConfig) {
    this.profileData = profileData;
    this.init = init;
    this.callerClientConfig = callerClientConfig;
  }
  async loadCredentials() {
    const token = await this.loadToken();
    if (!token) {
      throw new CredentialsProviderError(`Failed to load a token for session ${this.loginSession}, please re-authenticate using aws login`, { tryNextLink: false, logger: this.logger });
    }
    const accessToken = token.accessToken;
    const now = Date.now();
    const expiryTime = new Date(accessToken.expiresAt).getTime();
    const timeUntilExpiry = expiryTime - now;
    if (timeUntilExpiry <= LoginCredentialsFetcher.REFRESH_THRESHOLD) {
      return this.refresh(token);
    }
    return {
      accessKeyId: accessToken.accessKeyId,
      secretAccessKey: accessToken.secretAccessKey,
      sessionToken: accessToken.sessionToken,
      accountId: accessToken.accountId,
      expiration: new Date(accessToken.expiresAt)
    };
  }
  get logger() {
    return this.init?.logger;
  }
  get loginSession() {
    return this.profileData.login_session;
  }
  async refresh(token) {
    const { SigninClient, CreateOAuth2TokenCommand } = await import("./index-BE0VhawX.mjs").then((n) => n.i);
    const { logger, userAgentAppId } = this.callerClientConfig ?? {};
    const isH2 = (requestHandler2) => {
      return requestHandler2?.metadata?.handlerProtocol === "h2";
    };
    const requestHandler = isH2(this.callerClientConfig?.requestHandler) ? void 0 : this.callerClientConfig?.requestHandler;
    const region = this.profileData.region ?? await this.callerClientConfig?.region?.() ?? process.env.AWS_REGION;
    const client = new SigninClient({
      credentials: {
        accessKeyId: "",
        secretAccessKey: ""
      },
      region,
      requestHandler,
      logger,
      userAgentAppId,
      ...this.init?.clientConfig
    });
    this.createDPoPInterceptor(client.middlewareStack);
    const commandInput = {
      tokenInput: {
        clientId: token.clientId,
        refreshToken: token.refreshToken,
        grantType: "refresh_token"
      }
    };
    try {
      const response = await client.send(new CreateOAuth2TokenCommand(commandInput));
      const { accessKeyId, secretAccessKey, sessionToken } = response.tokenOutput?.accessToken ?? {};
      const { refreshToken, expiresIn } = response.tokenOutput ?? {};
      if (!accessKeyId || !secretAccessKey || !sessionToken || !refreshToken) {
        throw new CredentialsProviderError("Token refresh response missing required fields", {
          logger: this.logger,
          tryNextLink: false
        });
      }
      const expiresInMs = (expiresIn ?? 900) * 1e3;
      const expiration = new Date(Date.now() + expiresInMs);
      const updatedToken = {
        ...token,
        accessToken: {
          ...token.accessToken,
          accessKeyId,
          secretAccessKey,
          sessionToken,
          expiresAt: expiration.toISOString()
        },
        refreshToken
      };
      await this.saveToken(updatedToken);
      const newAccessToken = updatedToken.accessToken;
      return {
        accessKeyId: newAccessToken.accessKeyId,
        secretAccessKey: newAccessToken.secretAccessKey,
        sessionToken: newAccessToken.sessionToken,
        accountId: newAccessToken.accountId,
        expiration
      };
    } catch (error) {
      if (error.name === "AccessDeniedException") {
        const errorType = error.error;
        let message;
        switch (errorType) {
          case "TOKEN_EXPIRED":
            message = "Your session has expired. Please reauthenticate.";
            break;
          case "USER_CREDENTIALS_CHANGED":
            message = "Unable to refresh credentials because of a change in your password. Please reauthenticate with your new password.";
            break;
          case "INSUFFICIENT_PERMISSIONS":
            message = "Unable to refresh credentials due to insufficient permissions. You may be missing permission for the 'CreateOAuth2Token' action.";
            break;
          default:
            message = `Failed to refresh token: ${String(error)}. Please re-authenticate using \`aws login\``;
        }
        throw new CredentialsProviderError(message, { logger: this.logger, tryNextLink: false });
      }
      throw new CredentialsProviderError(`Failed to refresh token: ${String(error)}. Please re-authenticate using aws login`, { logger: this.logger });
    }
  }
  async loadToken() {
    const tokenFilePath = this.getTokenFilePath();
    try {
      let tokenData;
      try {
        tokenData = await readFile(tokenFilePath, { ignoreCache: this.init?.ignoreCache });
      } catch {
        tokenData = await promises.readFile(tokenFilePath, "utf8");
      }
      const token = JSON.parse(tokenData);
      const missingFields = ["accessToken", "clientId", "refreshToken", "dpopKey"].filter((k) => !token[k]);
      if (!token.accessToken?.accountId) {
        missingFields.push("accountId");
      }
      if (missingFields.length > 0) {
        throw new CredentialsProviderError(`Token validation failed, missing fields: ${missingFields.join(", ")}`, {
          logger: this.logger,
          tryNextLink: false
        });
      }
      return token;
    } catch (error) {
      throw new CredentialsProviderError(`Failed to load token from ${tokenFilePath}: ${String(error)}`, {
        logger: this.logger,
        tryNextLink: false
      });
    }
  }
  async saveToken(token) {
    const tokenFilePath = this.getTokenFilePath();
    const directory = dirname(tokenFilePath);
    try {
      await promises.mkdir(directory, { recursive: true });
    } catch (error) {
    }
    await promises.writeFile(tokenFilePath, JSON.stringify(token, null, 2), "utf8");
  }
  getTokenFilePath() {
    const directory = process.env.AWS_LOGIN_CACHE_DIRECTORY ?? join(homedir(), ".aws", "login", "cache");
    const loginSessionBytes = Buffer.from(this.loginSession, "utf8");
    const loginSessionSha256 = createHash("sha256").update(loginSessionBytes).digest("hex");
    return join(directory, `${loginSessionSha256}.json`);
  }
  derToRawSignature(derSignature) {
    let offset = 2;
    if (derSignature[offset] !== 2) {
      throw new Error("Invalid DER signature");
    }
    offset++;
    const rLength = derSignature[offset++];
    let r = derSignature.subarray(offset, offset + rLength);
    offset += rLength;
    if (derSignature[offset] !== 2) {
      throw new Error("Invalid DER signature");
    }
    offset++;
    const sLength = derSignature[offset++];
    let s = derSignature.subarray(offset, offset + sLength);
    r = r[0] === 0 ? r.subarray(1) : r;
    s = s[0] === 0 ? s.subarray(1) : s;
    const rPadded = Buffer.concat([Buffer.alloc(32 - r.length), r]);
    const sPadded = Buffer.concat([Buffer.alloc(32 - s.length), s]);
    return Buffer.concat([rPadded, sPadded]);
  }
  createDPoPInterceptor(middlewareStack) {
    middlewareStack.add((next) => async (args) => {
      if (HttpRequest.isInstance(args.request)) {
        const request = args.request;
        const actualEndpoint = `${request.protocol}//${request.hostname}${request.port ? `:${request.port}` : ""}${request.path}`;
        const dpop = await this.generateDpop(request.method, actualEndpoint);
        request.headers = {
          ...request.headers,
          DPoP: dpop
        };
      }
      return next(args);
    }, {
      step: "finalizeRequest",
      name: "dpopInterceptor",
      override: true
    });
  }
  async generateDpop(method = "POST", endpoint) {
    const token = await this.loadToken();
    try {
      const privateKey = createPrivateKey({
        key: token.dpopKey,
        format: "pem",
        type: "sec1"
      });
      const publicKey = createPublicKey(privateKey);
      const publicDer = publicKey.export({ format: "der", type: "spki" });
      let pointStart = -1;
      for (let i = 0; i < publicDer.length; i++) {
        if (publicDer[i] === 4) {
          pointStart = i;
          break;
        }
      }
      const x = publicDer.slice(pointStart + 1, pointStart + 33);
      const y = publicDer.slice(pointStart + 33, pointStart + 65);
      const header = {
        alg: "ES256",
        typ: "dpop+jwt",
        jwk: {
          kty: "EC",
          crv: "P-256",
          x: x.toString("base64url"),
          y: y.toString("base64url")
        }
      };
      const payload = {
        jti: crypto.randomUUID(),
        htm: method,
        htu: endpoint,
        iat: Math.floor(Date.now() / 1e3)
      };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const message = `${headerB64}.${payloadB64}`;
      const asn1Signature = sign("sha256", Buffer.from(message), privateKey);
      const rawSignature = this.derToRawSignature(asn1Signature);
      const signatureB64 = rawSignature.toString("base64url");
      return `${message}.${signatureB64}`;
    } catch (error) {
      throw new CredentialsProviderError(`Failed to generate Dpop proof: ${error instanceof Error ? error.message : String(error)}`, { logger: this.logger, tryNextLink: false });
    }
  }
}
const fromLoginCredentials = (init) => async ({ callerClientConfig } = {}) => {
  init?.logger?.debug?.("@aws-sdk/credential-providers - fromLoginCredentials");
  const profiles = await parseKnownFiles(init || {});
  const profileName = getProfileName({
    profile: init?.profile ?? callerClientConfig?.profile
  });
  const profile = profiles[profileName];
  if (!profile?.login_session) {
    throw new CredentialsProviderError(`Profile ${profileName} does not contain login_session.`, {
      tryNextLink: true,
      logger: init?.logger
    });
  }
  const fetcher = new LoginCredentialsFetcher(profile, init, callerClientConfig);
  const credentials = await fetcher.loadCredentials();
  return clientExports.setCredentialFeature(credentials, "CREDENTIALS_LOGIN", "AD");
};
const isLoginProfile = (data) => {
  return Boolean(data && data.login_session);
};
const resolveLoginCredentials = async (profileName, options, callerClientConfig) => {
  const credentials = await fromLoginCredentials({
    ...options,
    profile: profileName
  })({ callerClientConfig });
  return clientExports.setCredentialFeature(credentials, "CREDENTIALS_PROFILE_LOGIN", "AC");
};
const isProcessProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.credential_process === "string";
const resolveProcessCredentials = async (options, profile) => import("./index-D26vmcc7.mjs").then(({ fromProcess }) => fromProcess({
  ...options,
  profile
})().then((creds) => clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_PROCESS", "v")));
const resolveSsoCredentials = async (profile, profileData, options = {}, callerClientConfig) => {
  const { fromSSO } = await import("./index-DN4-6psK.mjs");
  return fromSSO({
    profile,
    logger: options.logger,
    parentClientConfig: options.parentClientConfig,
    clientConfig: options.clientConfig
  })({
    callerClientConfig
  }).then((creds) => {
    if (profileData.sso_session) {
      return clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SSO", "r");
    } else {
      return clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SSO_LEGACY", "t");
    }
  });
};
const isSsoProfile = (arg) => arg && (typeof arg.sso_start_url === "string" || typeof arg.sso_account_id === "string" || typeof arg.sso_session === "string" || typeof arg.sso_region === "string" || typeof arg.sso_role_name === "string");
const isStaticCredsProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.aws_access_key_id === "string" && typeof arg.aws_secret_access_key === "string" && ["undefined", "string"].indexOf(typeof arg.aws_session_token) > -1 && ["undefined", "string"].indexOf(typeof arg.aws_account_id) > -1;
const resolveStaticCredentials = async (profile, options) => {
  options?.logger?.debug("@aws-sdk/credential-provider-ini - resolveStaticCredentials");
  const credentials = {
    accessKeyId: profile.aws_access_key_id,
    secretAccessKey: profile.aws_secret_access_key,
    sessionToken: profile.aws_session_token,
    ...profile.aws_credential_scope && { credentialScope: profile.aws_credential_scope },
    ...profile.aws_account_id && { accountId: profile.aws_account_id }
  };
  return clientExports.setCredentialFeature(credentials, "CREDENTIALS_PROFILE", "n");
};
const isWebIdentityProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.web_identity_token_file === "string" && typeof arg.role_arn === "string" && ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1;
const resolveWebIdentityCredentials = async (profile, options, callerClientConfig) => import("./index-BCJE-yJy.mjs").then(({ fromTokenFile }) => fromTokenFile({
  webIdentityTokenFile: profile.web_identity_token_file,
  roleArn: profile.role_arn,
  roleSessionName: profile.role_session_name,
  roleAssumerWithWebIdentity: options.roleAssumerWithWebIdentity,
  logger: options.logger,
  parentClientConfig: options.parentClientConfig
})({
  callerClientConfig
}).then((creds) => clientExports.setCredentialFeature(creds, "CREDENTIALS_PROFILE_STS_WEB_ID_TOKEN", "q")));
const resolveProfileData = async (profileName, profiles, options, callerClientConfig, visitedProfiles = {}, isAssumeRoleRecursiveCall = false) => {
  const data = profiles[profileName];
  if (Object.keys(visitedProfiles).length > 0 && isStaticCredsProfile(data)) {
    return resolveStaticCredentials(data, options);
  }
  if (isAssumeRoleRecursiveCall || isAssumeRoleProfile(data, { profile: profileName, logger: options.logger })) {
    return resolveAssumeRoleCredentials(profileName, profiles, options, callerClientConfig, visitedProfiles, resolveProfileData);
  }
  if (isStaticCredsProfile(data)) {
    return resolveStaticCredentials(data, options);
  }
  if (isWebIdentityProfile(data)) {
    return resolveWebIdentityCredentials(data, options, callerClientConfig);
  }
  if (isProcessProfile(data)) {
    return resolveProcessCredentials(options, profileName);
  }
  if (isSsoProfile(data)) {
    return await resolveSsoCredentials(profileName, data, options, callerClientConfig);
  }
  if (isLoginProfile(data)) {
    return resolveLoginCredentials(profileName, options, callerClientConfig);
  }
  throw new CredentialsProviderError(`Could not resolve credentials using profile: [${profileName}] in configuration/credentials file(s).`, { logger: options.logger });
};
const fromIni = (init = {}) => async ({ callerClientConfig } = {}) => {
  init.logger?.debug("@aws-sdk/credential-provider-ini - fromIni");
  const profiles = await parseKnownFiles(init);
  return resolveProfileData(getProfileName({
    profile: init.profile ?? callerClientConfig?.profile
  }), profiles, init, callerClientConfig);
};
export {
  fromIni
};
