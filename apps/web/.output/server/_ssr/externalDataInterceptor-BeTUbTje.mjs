import { t as tokenIntercept } from "./getSSOTokenFromFile-llUUhFxV.mjs";
import { au as fileIntercept } from "./index-D2KejSDZ.mjs";
const externalDataInterceptor = {
  getFileRecord() {
    return fileIntercept;
  },
  interceptFile(path, contents) {
    fileIntercept[path] = Promise.resolve(contents);
  },
  getTokenRecord() {
    return tokenIntercept;
  },
  interceptToken(id, contents) {
    tokenIntercept[id] = contents;
  }
};
export {
  externalDataInterceptor as e
};
