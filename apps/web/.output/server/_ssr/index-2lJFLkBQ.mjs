import { a2 as createAdapterFactory, a3 as logger$1 } from "./index-D2KejSDZ.mjs";
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
const memoryAdapter = (db, config) => {
  let lazyOptions = null;
  const adapterCreator = createAdapterFactory({
    config: {
      adapterId: "memory",
      adapterName: "Memory Adapter",
      usePlural: false,
      debugLogs: config?.debugLogs || false,
      supportsArrays: true,
      customTransformInput(props) {
        if (props.options.advanced?.database?.generateId === "serial" && props.field === "id" && props.action === "create") return db[props.model].length + 1;
        return props.data;
      },
      transaction: async (cb) => {
        const clone = structuredClone(db);
        try {
          return await cb(adapterCreator(lazyOptions));
        } catch (error) {
          Object.keys(db).forEach((key) => {
            db[key] = clone[key];
          });
          throw error;
        }
      }
    },
    adapter: ({ getFieldName, getDefaultFieldName, options, getModelName }) => {
      const applySortToRecords = (records, sortBy, model) => {
        if (!sortBy) return records;
        return records.sort((a, b) => {
          const field = getFieldName({
            model,
            field: sortBy.field
          });
          const aValue = a[field];
          const bValue = b[field];
          let comparison = 0;
          if (aValue == null && bValue == null) comparison = 0;
          else if (aValue == null) comparison = -1;
          else if (bValue == null) comparison = 1;
          else if (typeof aValue === "string" && typeof bValue === "string") comparison = aValue.localeCompare(bValue);
          else if (aValue instanceof Date && bValue instanceof Date) comparison = aValue.getTime() - bValue.getTime();
          else if (typeof aValue === "number" && typeof bValue === "number") comparison = aValue - bValue;
          else if (typeof aValue === "boolean" && typeof bValue === "boolean") comparison = aValue === bValue ? 0 : aValue ? 1 : -1;
          else comparison = String(aValue).localeCompare(String(bValue));
          return sortBy.direction === "asc" ? comparison : -comparison;
        });
      };
      function convertWhereClause(where, model, join, select) {
        const baseRecords = (() => {
          const table = db[model];
          if (!table) {
            logger$1.error(`[MemoryAdapter] Model ${model} not found in the DB`, Object.keys(db));
            throw new Error(`Model ${model} not found`);
          }
          const evalClause = (record, clause) => {
            const { field, value, operator } = clause;
            switch (operator) {
              case "in":
                if (!Array.isArray(value)) throw new Error("Value must be an array");
                return value.includes(record[field]);
              case "not_in":
                if (!Array.isArray(value)) throw new Error("Value must be an array");
                return !value.includes(record[field]);
              case "contains":
                return record[field].includes(value);
              case "starts_with":
                return record[field].startsWith(value);
              case "ends_with":
                return record[field].endsWith(value);
              case "ne":
                return record[field] !== value;
              case "gt":
                return value != null && Boolean(record[field] > value);
              case "gte":
                return value != null && Boolean(record[field] >= value);
              case "lt":
                return value != null && Boolean(record[field] < value);
              case "lte":
                return value != null && Boolean(record[field] <= value);
              default:
                return record[field] === value;
            }
          };
          let records = table.filter((record) => {
            if (!where.length || where.length === 0) return true;
            let result = evalClause(record, where[0]);
            for (const clause of where) {
              const clauseResult = evalClause(record, clause);
              if (clause.connector === "OR") result = result || clauseResult;
              else result = result && clauseResult;
            }
            return result;
          });
          if (select?.length && select.length > 0) records = records.map((record) => Object.fromEntries(Object.entries(record).filter(([key]) => select.includes(getDefaultFieldName({
            model,
            field: key
          })))));
          return records;
        })();
        if (!join) return baseRecords;
        const grouped = /* @__PURE__ */ new Map();
        const seenIds = /* @__PURE__ */ new Map();
        for (const baseRecord of baseRecords) {
          const baseId = String(baseRecord.id);
          if (!grouped.has(baseId)) {
            const nested = { ...baseRecord };
            for (const [joinModel, joinAttr] of Object.entries(join)) {
              const joinModelName = getModelName(joinModel);
              if (joinAttr.relation === "one-to-one") nested[joinModelName] = null;
              else {
                nested[joinModelName] = [];
                seenIds.set(`${baseId}-${joinModel}`, /* @__PURE__ */ new Set());
              }
            }
            grouped.set(baseId, nested);
          }
          const nestedEntry = grouped.get(baseId);
          for (const [joinModel, joinAttr] of Object.entries(join)) {
            const joinModelName = getModelName(joinModel);
            const joinTable = db[joinModelName];
            if (!joinTable) {
              logger$1.error(`[MemoryAdapter] JoinOption model ${joinModelName} not found in the DB`, Object.keys(db));
              throw new Error(`JoinOption model ${joinModelName} not found`);
            }
            const matchingRecords = joinTable.filter((joinRecord) => joinRecord[joinAttr.on.to] === baseRecord[joinAttr.on.from]);
            if (joinAttr.relation === "one-to-one") nestedEntry[joinModelName] = matchingRecords[0] || null;
            else {
              const seenSet = seenIds.get(`${baseId}-${joinModel}`);
              const limit = joinAttr.limit ?? 100;
              let count = 0;
              for (const matchingRecord of matchingRecords) {
                if (count >= limit) break;
                if (!seenSet.has(matchingRecord.id)) {
                  nestedEntry[joinModelName].push(matchingRecord);
                  seenSet.add(matchingRecord.id);
                  count++;
                }
              }
            }
          }
        }
        return Array.from(grouped.values());
      }
      return {
        create: async ({ model, data }) => {
          if (options.advanced?.database?.generateId === "serial") data.id = db[getModelName(model)].length + 1;
          if (!db[model]) db[model] = [];
          db[model].push(data);
          return data;
        },
        findOne: async ({ model, where, select, join }) => {
          const res = convertWhereClause(where, model, join, select);
          if (join) {
            const resArray = res;
            if (!resArray.length) return null;
            return resArray[0];
          }
          return res[0] || null;
        },
        findMany: async ({ model, where, sortBy, limit, select, offset, join }) => {
          const res = convertWhereClause(where || [], model, join, select);
          if (join) {
            const resArray = res;
            if (!resArray.length) return [];
            applySortToRecords(resArray, sortBy, model);
            let paginatedRecords = resArray;
            if (offset !== void 0) paginatedRecords = paginatedRecords.slice(offset);
            if (limit !== void 0) paginatedRecords = paginatedRecords.slice(0, limit);
            return paginatedRecords;
          }
          let table = applySortToRecords(res, sortBy, model);
          if (offset !== void 0) table = table.slice(offset);
          if (limit !== void 0) table = table.slice(0, limit);
          return table || [];
        },
        count: async ({ model, where }) => {
          if (where) return convertWhereClause(where, model).length;
          return db[model].length;
        },
        update: async ({ model, where, update }) => {
          const res = convertWhereClause(where, model);
          res.forEach((record) => {
            Object.assign(record, update);
          });
          return res[0] || null;
        },
        delete: async ({ model, where }) => {
          const table = db[model];
          const res = convertWhereClause(where, model);
          db[model] = table.filter((record) => !res.includes(record));
        },
        deleteMany: async ({ model, where }) => {
          const table = db[model];
          const res = convertWhereClause(where, model);
          let count = 0;
          db[model] = table.filter((record) => {
            if (res.includes(record)) {
              count++;
              return false;
            }
            return !res.includes(record);
          });
          return count;
        },
        updateMany({ model, where, update }) {
          const res = convertWhereClause(where, model);
          res.forEach((record) => {
            Object.assign(record, update);
          });
          return res[0] || null;
        }
      };
    }
  });
  return (options) => {
    lazyOptions = options;
    return adapterCreator(options);
  };
};
export {
  memoryAdapter
};
