import { o as OrganizationId, Z as ChSqlClient, _ as toRepositoryError } from "./index-D2KejSDZ.mjs";
import { p as provide, e as provideMerge, h as succeed, t as tryPromise } from "../_libs/effect.mjs";
const ChSqlClientLive = (client, organizationId) => succeed(ChSqlClient, {
  organizationId,
  transaction: (effect) => effect,
  query: (fn) => tryPromise({
    try: () => fn(client, organizationId),
    catch: (error) => toRepositoryError(error, "query")
  })
});
const withClickHouse = (layer, client, organizationId = OrganizationId("system")) => provide(layer.pipe(provideMerge(ChSqlClientLive(client, organizationId))));
export {
  withClickHouse as w
};
