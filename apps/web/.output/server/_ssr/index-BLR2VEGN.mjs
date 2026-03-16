import { ab as require$$6 } from "./index-D2KejSDZ.mjs";
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
var eventStreams = {};
var hasRequiredEventStreams;
function requireEventStreams() {
  if (hasRequiredEventStreams) return eventStreams;
  hasRequiredEventStreams = 1;
  var utilUtf8 = require$$6;
  class EventStreamSerde {
    marshaller;
    serializer;
    deserializer;
    serdeContext;
    defaultContentType;
    constructor({ marshaller, serializer, deserializer, serdeContext, defaultContentType }) {
      this.marshaller = marshaller;
      this.serializer = serializer;
      this.deserializer = deserializer;
      this.serdeContext = serdeContext;
      this.defaultContentType = defaultContentType;
    }
    async serializeEventStream({ eventStream, requestSchema, initialRequest }) {
      const marshaller = this.marshaller;
      const eventStreamMember = requestSchema.getEventStreamMember();
      const unionSchema = requestSchema.getMemberSchema(eventStreamMember);
      const serializer = this.serializer;
      const defaultContentType = this.defaultContentType;
      const initialRequestMarker = /* @__PURE__ */ Symbol("initialRequestMarker");
      const eventStreamIterable = {
        async *[Symbol.asyncIterator]() {
          if (initialRequest) {
            const headers = {
              ":event-type": { type: "string", value: "initial-request" },
              ":message-type": { type: "string", value: "event" },
              ":content-type": { type: "string", value: defaultContentType }
            };
            serializer.write(requestSchema, initialRequest);
            const body = serializer.flush();
            yield {
              [initialRequestMarker]: true,
              headers,
              body
            };
          }
          for await (const page of eventStream) {
            yield page;
          }
        }
      };
      return marshaller.serialize(eventStreamIterable, (event) => {
        if (event[initialRequestMarker]) {
          return {
            headers: event.headers,
            body: event.body
          };
        }
        const unionMember = Object.keys(event).find((key) => {
          return key !== "__type";
        }) ?? "";
        const { additionalHeaders, body, eventType, explicitPayloadContentType } = this.writeEventBody(unionMember, unionSchema, event);
        const headers = {
          ":event-type": { type: "string", value: eventType },
          ":message-type": { type: "string", value: "event" },
          ":content-type": { type: "string", value: explicitPayloadContentType ?? defaultContentType },
          ...additionalHeaders
        };
        return {
          headers,
          body
        };
      });
    }
    async deserializeEventStream({ response, responseSchema, initialResponseContainer }) {
      const marshaller = this.marshaller;
      const eventStreamMember = responseSchema.getEventStreamMember();
      const unionSchema = responseSchema.getMemberSchema(eventStreamMember);
      const memberSchemas = unionSchema.getMemberSchemas();
      const initialResponseMarker = /* @__PURE__ */ Symbol("initialResponseMarker");
      const asyncIterable = marshaller.deserialize(response.body, async (event) => {
        const unionMember = Object.keys(event).find((key) => {
          return key !== "__type";
        }) ?? "";
        const body = event[unionMember].body;
        if (unionMember === "initial-response") {
          const dataObject = await this.deserializer.read(responseSchema, body);
          delete dataObject[eventStreamMember];
          return {
            [initialResponseMarker]: true,
            ...dataObject
          };
        } else if (unionMember in memberSchemas) {
          const eventStreamSchema = memberSchemas[unionMember];
          if (eventStreamSchema.isStructSchema()) {
            const out = {};
            let hasBindings = false;
            for (const [name, member] of eventStreamSchema.structIterator()) {
              const { eventHeader, eventPayload } = member.getMergedTraits();
              hasBindings = hasBindings || Boolean(eventHeader || eventPayload);
              if (eventPayload) {
                if (member.isBlobSchema()) {
                  out[name] = body;
                } else if (member.isStringSchema()) {
                  out[name] = (this.serdeContext?.utf8Encoder ?? utilUtf8.toUtf8)(body);
                } else if (member.isStructSchema()) {
                  out[name] = await this.deserializer.read(member, body);
                }
              } else if (eventHeader) {
                const value = event[unionMember].headers[name]?.value;
                if (value != null) {
                  if (member.isNumericSchema()) {
                    if (value && typeof value === "object" && "bytes" in value) {
                      out[name] = BigInt(value.toString());
                    } else {
                      out[name] = Number(value);
                    }
                  } else {
                    out[name] = value;
                  }
                }
              }
            }
            if (hasBindings) {
              return {
                [unionMember]: out
              };
            }
            if (body.byteLength === 0) {
              return {
                [unionMember]: {}
              };
            }
          }
          return {
            [unionMember]: await this.deserializer.read(eventStreamSchema, body)
          };
        } else {
          return {
            $unknown: event
          };
        }
      });
      const asyncIterator = asyncIterable[Symbol.asyncIterator]();
      const firstEvent = await asyncIterator.next();
      if (firstEvent.done) {
        return asyncIterable;
      }
      if (firstEvent.value?.[initialResponseMarker]) {
        if (!responseSchema) {
          throw new Error("@smithy::core/protocols - initial-response event encountered in event stream but no response schema given.");
        }
        for (const [key, value] of Object.entries(firstEvent.value)) {
          initialResponseContainer[key] = value;
        }
      }
      return {
        async *[Symbol.asyncIterator]() {
          if (!firstEvent?.value?.[initialResponseMarker]) {
            yield firstEvent.value;
          }
          while (true) {
            const { done, value } = await asyncIterator.next();
            if (done) {
              break;
            }
            yield value;
          }
        }
      };
    }
    writeEventBody(unionMember, unionSchema, event) {
      const serializer = this.serializer;
      let eventType = unionMember;
      let explicitPayloadMember = null;
      let explicitPayloadContentType;
      const isKnownSchema = (() => {
        const struct = unionSchema.getSchema();
        return struct[4].includes(unionMember);
      })();
      const additionalHeaders = {};
      if (!isKnownSchema) {
        const [type, value] = event[unionMember];
        eventType = type;
        serializer.write(15, value);
      } else {
        const eventSchema = unionSchema.getMemberSchema(unionMember);
        if (eventSchema.isStructSchema()) {
          for (const [memberName, memberSchema] of eventSchema.structIterator()) {
            const { eventHeader, eventPayload } = memberSchema.getMergedTraits();
            if (eventPayload) {
              explicitPayloadMember = memberName;
            } else if (eventHeader) {
              const value = event[unionMember][memberName];
              let type = "binary";
              if (memberSchema.isNumericSchema()) {
                if ((-2) ** 31 <= value && value <= 2 ** 31 - 1) {
                  type = "integer";
                } else {
                  type = "long";
                }
              } else if (memberSchema.isTimestampSchema()) {
                type = "timestamp";
              } else if (memberSchema.isStringSchema()) {
                type = "string";
              } else if (memberSchema.isBooleanSchema()) {
                type = "boolean";
              }
              if (value != null) {
                additionalHeaders[memberName] = {
                  type,
                  value
                };
                delete event[unionMember][memberName];
              }
            }
          }
          if (explicitPayloadMember !== null) {
            const payloadSchema = eventSchema.getMemberSchema(explicitPayloadMember);
            if (payloadSchema.isBlobSchema()) {
              explicitPayloadContentType = "application/octet-stream";
            } else if (payloadSchema.isStringSchema()) {
              explicitPayloadContentType = "text/plain";
            }
            serializer.write(payloadSchema, event[unionMember][explicitPayloadMember]);
          } else {
            serializer.write(eventSchema, event[unionMember]);
          }
        } else if (eventSchema.isUnitSchema()) {
          serializer.write(eventSchema, {});
        } else {
          throw new Error("@smithy/core/event-streams - non-struct member not supported in event stream union.");
        }
      }
      const messageSerialization = serializer.flush();
      const body = typeof messageSerialization === "string" ? (this.serdeContext?.utf8Decoder ?? utilUtf8.fromUtf8)(messageSerialization) : messageSerialization;
      return {
        body,
        eventType,
        explicitPayloadContentType,
        additionalHeaders
      };
    }
  }
  eventStreams.EventStreamSerde = EventStreamSerde;
  return eventStreams;
}
var eventStreamsExports = /* @__PURE__ */ requireEventStreams();
const index = /* @__PURE__ */ _mergeNamespaces$1({
  __proto__: null
}, [eventStreamsExports]);
export {
  index as i
};
