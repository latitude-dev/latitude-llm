import { Context } from "effect";

export class ObjectStorageAdapterTag extends Context.Tag("ObjectStorageAdapterTag")<
  ObjectStorageAdapterTag,
  {
    readonly type: "object-storage";
  }
>() {}

export const objectStorageAdapter = {
  type: "object-storage" as const,
};
