import { o as OrganizationId, S as SqlClientLive } from "./index-D2KejSDZ.mjs";
import { p as provide, e as provideMerge } from "../_libs/effect.mjs";
const withPostgres = (layer, client, organizationId = OrganizationId("system")) => provide(layer.pipe(provideMerge(SqlClientLive(client, organizationId))));
export {
  withPostgres as w
};
