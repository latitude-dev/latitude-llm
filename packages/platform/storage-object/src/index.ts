import { ServiceMap } from "effect";

export class ObjectStorageAdapterTag extends ServiceMap.Service<
  ObjectStorageAdapterTag,
  {
    readonly type: "object-storage";
  }
>()("ObjectStorageAdapterTag") {}

export const objectStorageAdapter = {
  type: "object-storage" as const,
};
