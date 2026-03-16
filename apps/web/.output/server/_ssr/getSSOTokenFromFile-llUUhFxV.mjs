import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { join } from "path";
import { av as getHomeDir } from "./index-D2KejSDZ.mjs";
const getSSOTokenFilepath = (id) => {
  const hasher = createHash("sha1");
  const cacheName = hasher.update(id).digest("hex");
  return join(getHomeDir(), ".aws", "sso", "cache", `${cacheName}.json`);
};
const tokenIntercept = {};
const getSSOTokenFromFile = async (id) => {
  if (tokenIntercept[id]) {
    return tokenIntercept[id];
  }
  const ssoTokenFilepath = getSSOTokenFilepath(id);
  const ssoTokenText = await readFile(ssoTokenFilepath, "utf8");
  return JSON.parse(ssoTokenText);
};
export {
  getSSOTokenFilepath as a,
  getSSOTokenFromFile as g,
  tokenIntercept as t
};
