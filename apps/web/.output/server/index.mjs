globalThis.__nitro_main__ = import.meta.url;
import { N as NodeResponse, s as serve } from "./_libs/srvx.mjs";
import { H as HTTPError, d as defineHandler, a as toEventHandler, b as defineLazyEventHandler, c as H3Core } from "./_libs/h3.mjs";
import { d as decodePath, w as withLeadingSlash, a as withoutTrailingSlash, j as joinURL } from "./_libs/ufo.mjs";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "node:http";
import "node:stream";
import "node:stream/promises";
import "node:https";
import "node:http2";
import "./_libs/rou3.mjs";
function lazyService(loader) {
  let promise, mod;
  return {
    fetch(req) {
      if (mod) {
        return mod.fetch(req);
      }
      if (!promise) {
        promise = loader().then((_mod) => mod = _mod.default || _mod);
      }
      return promise.then((mod2) => mod2.fetch(req));
    }
  };
}
const services = {
  ["ssr"]: lazyService(() => import("./_ssr/index.mjs"))
};
globalThis.__nitro_vite_envs__ = services;
const errorHandler$1 = (error, event) => {
  const res = defaultHandler(error, event);
  return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
  const unhandled = error.unhandled ?? !HTTPError.isError(error);
  const { status = 500, statusText = "" } = unhandled ? {} : error;
  if (status === 404) {
    const url = event.url || new URL(event.req.url);
    const baseURL = "/";
    if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) {
      return {
        status: 302,
        headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
      };
    }
  }
  const headers2 = new Headers(unhandled ? {} : error.headers);
  headers2.set("content-type", "application/json; charset=utf-8");
  const jsonBody = unhandled ? {
    status,
    unhandled: true
  } : typeof error.toJSON === "function" ? error.toJSON() : {
    status,
    statusText,
    message: error.message
  };
  return {
    status,
    statusText,
    headers: headers2,
    body: {
      error: true,
      ...jsonBody
    }
  };
}
const errorHandlers = [errorHandler$1];
async function errorHandler(error, event) {
  for (const handler of errorHandlers) {
    try {
      const response = await handler(error, event, { defaultHandler });
      if (response) {
        return response;
      }
    } catch (error2) {
      console.error(error2);
    }
  }
}
const headers = ((m) => function headersRouteRule(event) {
  for (const [key2, value] of Object.entries(m.options || {})) {
    event.res.headers.set(key2, value);
  }
});
const assets = {
  "/assets/_authenticated-BGW8rW0b.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"cb0-B81iGl2BtWgn90l2arZqbbjyGFA"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 3248,
    "path": "../public/assets/_authenticated-BGW8rW0b.js"
  },
  "/assets/_datasetId-BqPnBTdV.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"aaec-RZg9eMfIwp9BjPz7xViCQZN871w"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 43756,
    "path": "../public/assets/_datasetId-BqPnBTdV.js"
  },
  "/assets/_projectId-Dp-Jubl6.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"14b8-y3txGZSWYerUaQwomnx0uR/lLRQ"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 5304,
    "path": "../public/assets/_projectId-Dp-Jubl6.js"
  },
  "/assets/auth.functions-BHZzCain.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2ab-RdDMuwhTu3FWGje775ZF/sjreMs"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 683,
    "path": "../public/assets/auth.functions-BHZzCain.js"
  },
  "/assets/auth-client-KRueaLqP.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"909f-B7g3XAjIIzFKuXOL5FKHxtHuM1c"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 37023,
    "path": "../public/assets/auth-client-KRueaLqP.js"
  },
  "/assets/circle-x-COSq-rx7.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"159-risUPeCY95Y5MOOpMv1p9iK4sf8"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 345,
    "path": "../public/assets/circle-x-COSq-rx7.js"
  },
  "/assets/cli-7k61uOAK.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"acc-gHOFR93SXvcfdQjlqdXcAv+mLn0"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 2764,
    "path": "../public/assets/cli-7k61uOAK.js"
  },
  "/assets/clipboard-DKAXKG0S.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"100-TPoD+CP+yV4omP+k0OWIgkBCrJg"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 256,
    "path": "../public/assets/clipboard-DKAXKG0S.js"
  },
  "/favicon.svg": {
    "type": "image/svg+xml",
    "etag": '"4e4-5jFQgI8dTRCjPU8WbG09p+ivISc"',
    "mtime": "2026-03-16T13:10:40.905Z",
    "size": 1252,
    "path": "../public/favicon.svg"
  },
  "/assets/confirm-CTZrgezI.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"da1-sCq5FKpVa3k/UVmtM49/2rmKFik"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 3489,
    "path": "../public/assets/confirm-CTZrgezI.js"
  },
  "/assets/container-B23Xq6Vz.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"12b-OKnyXuydC9yHOfbT8OYG98IOKJU"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 299,
    "path": "../public/assets/container-B23Xq6Vz.js"
  },
  "/assets/crypto-CQtmBpkj.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2a10-h/CXp6k/bILUSa2VFjxAyu1I374"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 10768,
    "path": "../public/assets/crypto-CQtmBpkj.js"
  },
  "/assets/datasets.collection-D9-OPFvh.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"61c-rrz1KjccbJp2L3FSNdtg3TV+SOg"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 1564,
    "path": "../public/assets/datasets.collection-D9-OPFvh.js"
  },
  "/assets/design-system-BRyv9TS2.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"277a-uKB/CyUvDIO59UFfxXNeUoDTdNg"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 10106,
    "path": "../public/assets/design-system-BRyv9TS2.js"
  },
  "/assets/dropdown-menu-Dqk-RtoX.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"71c-h4axmE8v7tXQTHeqvwLA7ntvJLQ"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 1820,
    "path": "../public/assets/dropdown-menu-Dqk-RtoX.js"
  },
  "/assets/index-B0a4Ia5m.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"7d8-rCBzpcTFEWNoKOiEkT8F4bAx5RM"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 2008,
    "path": "../public/assets/index-B0a4Ia5m.js"
  },
  "/assets/format-Blx0PIdI.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"22c-WnCN1NthktavyXgL1DAv2wIq3l4"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 556,
    "path": "../public/assets/format-Blx0PIdI.js"
  },
  "/assets/index-Bg8XM5iw.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"14ce-F1cmHGbvYz8i1DlpQQdWialvLCw"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 5326,
    "path": "../public/assets/index-Bg8XM5iw.js"
  },
  "/assets/index-Bxlw_RZl.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"944-OVkjHZjzoVl1sx62XMy5qnVsqUY"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 2372,
    "path": "../public/assets/index-Bxlw_RZl.js"
  },
  "/assets/codemirror-editor-D35hjhmQ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4a80d-RcrZt8hpDSQrbVP02Yx70gy+tm8"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 305165,
    "path": "../public/assets/codemirror-editor-D35hjhmQ.js"
  },
  "/assets/index-D1RENyjh.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"226-+6fj9qRQc7v9pPM0xanVkIe4by8"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 550,
    "path": "../public/assets/index-D1RENyjh.js"
  },
  "/assets/index-DCKIlK0d.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"12b-SpmRZqH3xySOc+y//rgU4mQYK8w"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 299,
    "path": "../public/assets/index-DCKIlK0d.js"
  },
  "/assets/index-DSVSbyp4.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1131-aUqHbwiKWF40f7j4WAsnuTrzIjY"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 4401,
    "path": "../public/assets/index-DSVSbyp4.js"
  },
  "/assets/index-QHEXvk9e.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"bfc-30yMf5qmzZOUgjTl/C+KKhGs8yM"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 3068,
    "path": "../public/assets/index-QHEXvk9e.js"
  },
  "/assets/index-_CgwV-m5.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"786-gWMTqJPzHFLjyExplU3Eu0m96bc"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 1926,
    "path": "../public/assets/index-_CgwV-m5.js"
  },
  "/assets/loader-circle-CxVV9BHq.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"8f-9MOSLC8xJERMMyim4Vb9SahfODg"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 143,
    "path": "../public/assets/loader-circle-CxVV9BHq.js"
  },
  "/assets/login-4YXFcTxA.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"18bf-j5xzs7Eukkhdam+8MbiaP+5izEw"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 6335,
    "path": "../public/assets/login-4YXFcTxA.js"
  },
  "/assets/mail-BAC3f7if.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1a0-wuRCYCSZehStByOqvEyU0hOnqF4"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 416,
    "path": "../public/assets/mail-BAC3f7if.js"
  },
  "/assets/main-BSn4Divn.css": {
    "type": "text/css; charset=utf-8",
    "etag": '"fb69-Z2hHSM3AKIeNWy70KjnV7hdMecg"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 64361,
    "path": "../public/assets/main-BSn4Divn.css"
  },
  "/assets/modal-Ct0IgONX.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"56f-xaMJnvMGsRsqZ/NmdLc0RDmzsho"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 1391,
    "path": "../public/assets/modal-Ct0IgONX.js"
  },
  "/assets/projects.collection-BT4WWi6E.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"5af-qfZOJWkGpuqg9cfMA4Z0g+GWqVc"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 1455,
    "path": "../public/assets/projects.collection-BT4WWi6E.js"
  },
  "/assets/relativeTime-BCxr0lvT.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"243-pmQmlrJ5E6vdMGMG3Wqb8pKLlSw"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 579,
    "path": "../public/assets/relativeTime-BCxr0lvT.js"
  },
  "/assets/settings-Bj8vFFGO.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"20a0-8pJ5rBXbFfDbFMrhjIfz8gctt1c"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 8352,
    "path": "../public/assets/settings-Bj8vFFGO.js"
  },
  "/assets/spans.collection-5mODmrwL.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"b8f-DzkJtrSVghzSp28Bbt3OeWP8uvE"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 2959,
    "path": "../public/assets/spans.collection-5mODmrwL.js"
  },
  "/assets/table-skeleton-CdKrW5SQ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"392-4ATZOjlTZO1M04eKyi6ubehkUkk"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 914,
    "path": "../public/assets/table-skeleton-CdKrW5SQ.js"
  },
  "/assets/signup-Cf_wRMSI.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"22a3-4H+t0pgW1Kcq34numTypKcNaTl8"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 8867,
    "path": "../public/assets/signup-Cf_wRMSI.js"
  },
  "/assets/trash-2-W_soows_.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"165-4ZT3NXW9NSYTjFLOL22gIJuqb58"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 357,
    "path": "../public/assets/trash-2-W_soows_.js"
  },
  "/assets/useForm-CKzVP0aR.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"9a30-Y8bCuxcFc6e6bpXCOp4PqgowhCo"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 39472,
    "path": "../public/assets/useForm-CKzVP0aR.js"
  },
  "/assets/query-oij4FoO7.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2b77d-DZG0hcGt5H+V73kpu1FVDk9okPI"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 178045,
    "path": "../public/assets/query-oij4FoO7.js"
  },
  "/assets/main-Dx3nfXW5.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"8b793-Uf5eAxXiuYZdJpBSygFHiZnLcWQ"',
    "mtime": "2026-03-16T13:10:36.046Z",
    "size": 571283,
    "path": "../public/assets/main-Dx3nfXW5.js"
  }
};
function readAsset(id) {
  const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
  return promises.readFile(resolve(serverDir, assets[id].path));
}
const publicAssetBases = {};
function isPublicAssetURL(id = "") {
  if (assets[id]) {
    return true;
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) {
      return true;
    }
  }
  return false;
}
function getAsset(id) {
  return assets[id];
}
const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = {
  gzip: ".gz",
  br: ".br",
  zstd: ".zst"
};
const _eDzIcz = defineHandler((event) => {
  if (event.req.method && !METHODS.has(event.req.method)) {
    return;
  }
  let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
  let asset;
  const encodingHeader = event.req.headers.get("accept-encoding") || "";
  const encodings = [...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      event.res.headers.delete("Cache-Control");
      throw new HTTPError({ status: 404 });
    }
    return;
  }
  if (encodings.length > 1) {
    event.res.headers.append("Vary", "Accept-Encoding");
  }
  const ifNotMatch = event.req.headers.get("if-none-match") === asset.etag;
  if (ifNotMatch) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }
  const ifModifiedSinceH = event.req.headers.get("if-modified-since");
  const mtimeDate = new Date(asset.mtime);
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }
  if (asset.type) {
    event.res.headers.set("Content-Type", asset.type);
  }
  if (asset.etag && !event.res.headers.has("ETag")) {
    event.res.headers.set("ETag", asset.etag);
  }
  if (asset.mtime && !event.res.headers.has("Last-Modified")) {
    event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
  }
  if (asset.encoding && !event.res.headers.has("Content-Encoding")) {
    event.res.headers.set("Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !event.res.headers.has("Content-Length")) {
    event.res.headers.set("Content-Length", asset.size.toString());
  }
  return readAsset(id);
});
const findRouteRules = /* @__PURE__ */ (() => {
  const $0 = [{ name: "headers", route: "/assets/**", handler: headers, options: { "cache-control": "public, max-age=31536000, immutable" } }];
  return (m, p) => {
    let r = [];
    if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
    let s = p.split("/"), l = s.length;
    if (l > 1) {
      if (s[1] === "assets") {
        r.unshift({ data: $0, params: { "_": s.slice(2).join("/") } });
      }
    }
    return r;
  };
})();
const _lazy_XSWCJ8 = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
const findRoute = /* @__PURE__ */ (() => {
  const data = { route: "/**", handler: _lazy_XSWCJ8 };
  return ((_m, p) => {
    return { data, params: { "_": p.slice(1) } };
  });
})();
const globalMiddleware = [
  toEventHandler(_eDzIcz)
].filter(Boolean);
const APP_ID = "default";
function useNitroApp() {
  let instance = useNitroApp._instance;
  if (instance) {
    return instance;
  }
  instance = useNitroApp._instance = createNitroApp();
  globalThis.__nitro__ = globalThis.__nitro__ || {};
  globalThis.__nitro__[APP_ID] = instance;
  return instance;
}
function createNitroApp() {
  const hooks = void 0;
  const captureError = (error, errorCtx) => {
    if (errorCtx?.event) {
      const errors = errorCtx.event.req.context?.nitro?.errors;
      if (errors) {
        errors.push({
          error,
          context: errorCtx
        });
      }
    }
  };
  const h3App = createH3App({ onError(error, event) {
    return errorHandler(error, event);
  } });
  let appHandler = (req) => {
    req.context ||= {};
    req.context.nitro = req.context.nitro || { errors: [] };
    return h3App.fetch(req);
  };
  const app = {
    fetch: appHandler,
    h3: h3App,
    hooks,
    captureError
  };
  return app;
}
function createH3App(config) {
  const h3App = new H3Core(config);
  h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
  h3App["~middleware"].push(...globalMiddleware);
  {
    h3App["~getMiddleware"] = (event, route) => {
      const pathname = event.url.pathname;
      const method = event.req.method;
      const middleware = [];
      {
        const routeRules = getRouteRules(method, pathname);
        event.context.routeRules = routeRules?.routeRules;
        if (routeRules?.routeRuleMiddleware.length) {
          middleware.push(...routeRules.routeRuleMiddleware);
        }
      }
      middleware.push(...h3App["~middleware"]);
      if (route?.data?.middleware?.length) {
        middleware.push(...route.data.middleware);
      }
      return middleware;
    };
  }
  return h3App;
}
function getRouteRules(method, pathname) {
  const m = findRouteRules(method, pathname);
  if (!m?.length) {
    return { routeRuleMiddleware: [] };
  }
  const routeRules = {};
  for (const layer of m) {
    for (const rule of layer.data) {
      const currentRule = routeRules[rule.name];
      if (currentRule) {
        if (rule.options === false) {
          delete routeRules[rule.name];
          continue;
        }
        if (typeof currentRule.options === "object" && typeof rule.options === "object") {
          currentRule.options = {
            ...currentRule.options,
            ...rule.options
          };
        } else {
          currentRule.options = rule.options;
        }
        currentRule.route = rule.route;
        currentRule.params = {
          ...currentRule.params,
          ...layer.params
        };
      } else if (rule.options !== false) {
        routeRules[rule.name] = {
          ...rule,
          params: layer.params
        };
      }
    }
  }
  const middleware = [];
  for (const rule of Object.values(routeRules)) {
    if (rule.options === false || !rule.handler) {
      continue;
    }
    middleware.push(rule.handler(rule));
  }
  return {
    routeRules,
    routeRuleMiddleware: middleware
  };
}
function _captureError(error, type) {
  console.error(`[${type}]`, error);
  useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
  process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
  process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
const _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
const port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
const host = process.env.NITRO_HOST || process.env.HOST;
const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const nitroApp = useNitroApp();
serve({
  port,
  hostname: host,
  tls: cert && key ? {
    cert,
    key
  } : void 0,
  fetch: nitroApp.fetch
});
trapUnhandledErrors();
const nodeServer = {};
export {
  nodeServer as default
};
