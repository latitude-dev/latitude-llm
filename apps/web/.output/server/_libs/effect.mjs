const pipeArguments = (self, args2) => {
  switch (args2.length) {
    case 0:
      return self;
    case 1:
      return args2[0](self);
    case 2:
      return args2[1](args2[0](self));
    case 3:
      return args2[2](args2[1](args2[0](self)));
    case 4:
      return args2[3](args2[2](args2[1](args2[0](self))));
    case 5:
      return args2[4](args2[3](args2[2](args2[1](args2[0](self)))));
    case 6:
      return args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self))))));
    case 7:
      return args2[6](args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self)))))));
    case 8:
      return args2[7](args2[6](args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self))))))));
    case 9:
      return args2[8](args2[7](args2[6](args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self)))))))));
    default: {
      let ret = self;
      for (let i = 0, len = args2.length; i < len; i++) {
        ret = args2[i](ret);
      }
      return ret;
    }
  }
};
const dual = function(arity, body) {
  if (typeof arity === "function") {
    return function() {
      return arity(arguments) ? body.apply(this, arguments) : (self) => body(self, ...arguments);
    };
  }
  switch (arity) {
    case 0:
    case 1:
      throw new RangeError(`Invalid arity ${arity}`);
    case 2:
      return function(a, b) {
        if (arguments.length >= 2) {
          return body(a, b);
        }
        return function(self) {
          return body(self, a);
        };
      };
    case 3:
      return function(a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c);
        }
        return function(self) {
          return body(self, a, b);
        };
      };
    default:
      return function() {
        if (arguments.length >= arity) {
          return body.apply(this, arguments);
        }
        const args2 = arguments;
        return function(self) {
          return body(self, ...args2);
        };
      };
  }
};
const identity = (a) => a;
const constant = (value2) => () => value2;
const constFalse = /* @__PURE__ */ constant(false);
const constUndefined = /* @__PURE__ */ constant(void 0);
const constVoid = constUndefined;
const getAllObjectKeys = (obj) => {
  const keys = new Set(Reflect.ownKeys(obj));
  if (obj.constructor === Object) return keys;
  if (obj instanceof Error) {
    keys.delete("stack");
  }
  const proto = Object.getPrototypeOf(obj);
  let current = proto;
  while (current !== null && current !== Object.prototype) {
    const ownKeys = Reflect.ownKeys(current);
    for (let i = 0; i < ownKeys.length; i++) {
      keys.add(ownKeys[i]);
    }
    current = Object.getPrototypeOf(current);
  }
  if (keys.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) {
    keys.delete("constructor");
  }
  return keys;
};
const byReferenceInstances = /* @__PURE__ */ new WeakSet();
function isString(input) {
  return typeof input === "string";
}
function isFunction(input) {
  return typeof input === "function";
}
function isObject(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
function isObjectKeyword(input) {
  return typeof input === "object" && input !== null || isFunction(input);
}
const hasProperty = /* @__PURE__ */ dual(2, (self, property) => isObjectKeyword(self) && property in self);
const isTagged = /* @__PURE__ */ dual(2, (self, tag) => hasProperty(self, "_tag") && self["_tag"] === tag);
function isIterable(input) {
  return hasProperty(input, Symbol.iterator) || isString(input);
}
const symbol$1 = "~effect/interfaces/Hash";
const hash = (self) => {
  switch (typeof self) {
    case "number":
      return number(self);
    case "bigint":
      return string(self.toString(10));
    case "boolean":
      return string(String(self));
    case "symbol":
      return string(String(self));
    case "string":
      return string(self);
    case "undefined":
      return string("undefined");
    case "function":
    case "object": {
      if (self === null) {
        return string("null");
      } else if (self instanceof Date) {
        return string(self.toISOString());
      } else if (self instanceof RegExp) {
        return string(self.toString());
      } else {
        if (byReferenceInstances.has(self)) {
          return random(self);
        }
        if (hashCache.has(self)) {
          return hashCache.get(self);
        }
        const h = withVisitedTracking$1(self, () => {
          if (isHash(self)) {
            return self[symbol$1]();
          } else if (typeof self === "function") {
            return random(self);
          } else if (Array.isArray(self)) {
            return array(self);
          } else if (self instanceof Map) {
            return hashMap(self);
          } else if (self instanceof Set) {
            return hashSet(self);
          }
          return structure(self);
        });
        hashCache.set(self, h);
        return h;
      }
    }
    default:
      throw new Error(`BUG: unhandled typeof ${typeof self} - please report an issue at https://github.com/Effect-TS/effect/issues`);
  }
};
const random = (self) => {
  if (!randomHashCache.has(self)) {
    randomHashCache.set(self, number(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
  }
  return randomHashCache.get(self);
};
const combine = /* @__PURE__ */ dual(2, (self, b) => self * 53 ^ b);
const optimize = (n) => n & 3221225471 | n >>> 1 & 1073741824;
const isHash = (u) => hasProperty(u, symbol$1);
const number = (n) => {
  if (n !== n) {
    return string("NaN");
  }
  if (n === Infinity) {
    return string("Infinity");
  }
  if (n === -Infinity) {
    return string("-Infinity");
  }
  let h = n | 0;
  if (h !== n) {
    h ^= n * 4294967295;
  }
  while (n > 4294967295) {
    h ^= n /= 4294967295;
  }
  return optimize(h);
};
const string = (str) => {
  let h = 5381, i = str.length;
  while (i) {
    h = h * 33 ^ str.charCodeAt(--i);
  }
  return optimize(h);
};
const structureKeys = (o, keys) => {
  let h = 12289;
  for (const key of keys) {
    h ^= combine(hash(key), hash(o[key]));
  }
  return optimize(h);
};
const structure = (o) => structureKeys(o, getAllObjectKeys(o));
const iterableWith = (seed, f) => (iter) => {
  let h = seed;
  for (const element of iter) {
    h ^= f(element);
  }
  return optimize(h);
};
const array = /* @__PURE__ */ iterableWith(6151, hash);
const hashMap = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Map"), ([k, v]) => combine(hash(k), hash(v)));
const hashSet = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Set"), hash);
const randomHashCache = /* @__PURE__ */ new WeakMap();
const hashCache = /* @__PURE__ */ new WeakMap();
const visitedObjects = /* @__PURE__ */ new WeakSet();
function withVisitedTracking$1(obj, fn) {
  if (visitedObjects.has(obj)) {
    return string("[Circular]");
  }
  visitedObjects.add(obj);
  const result2 = fn();
  visitedObjects.delete(obj);
  return result2;
}
const symbol = "~effect/interfaces/Equal";
function equals() {
  if (arguments.length === 1) {
    return (self) => compareBoth(self, arguments[0]);
  }
  return compareBoth(arguments[0], arguments[1]);
}
function compareBoth(self, that) {
  if (self === that) return true;
  if (self == null || that == null) return false;
  const selfType = typeof self;
  if (selfType !== typeof that) {
    return false;
  }
  if (selfType === "number" && self !== self && that !== that) {
    return true;
  }
  if (selfType !== "object" && selfType !== "function") {
    return false;
  }
  if (byReferenceInstances.has(self) || byReferenceInstances.has(that)) {
    return false;
  }
  return withCache(self, that, compareObjects);
}
function withVisitedTracking(self, that, fn) {
  const hasLeft = visitedLeft.has(self);
  const hasRight = visitedRight.has(that);
  if (hasLeft && hasRight) {
    return true;
  }
  if (hasLeft || hasRight) {
    return false;
  }
  visitedLeft.add(self);
  visitedRight.add(that);
  const result2 = fn();
  visitedLeft.delete(self);
  visitedRight.delete(that);
  return result2;
}
const visitedLeft = /* @__PURE__ */ new WeakSet();
const visitedRight = /* @__PURE__ */ new WeakSet();
function compareObjects(self, that) {
  if (hash(self) !== hash(that)) {
    return false;
  } else if (self instanceof Date) {
    if (!(that instanceof Date)) return false;
    return self.toISOString() === that.toISOString();
  } else if (self instanceof RegExp) {
    if (!(that instanceof RegExp)) return false;
    return self.toString() === that.toString();
  }
  const selfIsEqual = isEqual(self);
  const thatIsEqual = isEqual(that);
  if (selfIsEqual !== thatIsEqual) return false;
  const bothEquals = selfIsEqual && thatIsEqual;
  if (typeof self === "function" && !bothEquals) {
    return false;
  }
  return withVisitedTracking(self, that, () => {
    if (bothEquals) {
      return self[symbol](that);
    } else if (Array.isArray(self)) {
      if (!Array.isArray(that) || self.length !== that.length) {
        return false;
      }
      return compareArrays(self, that);
    } else if (self instanceof Map) {
      if (!(that instanceof Map) || self.size !== that.size) {
        return false;
      }
      return compareMaps(self, that);
    } else if (self instanceof Set) {
      if (!(that instanceof Set) || self.size !== that.size) {
        return false;
      }
      return compareSets(self, that);
    }
    return compareRecords(self, that);
  });
}
function withCache(self, that, f) {
  let selfMap = equalityCache.get(self);
  if (!selfMap) {
    selfMap = /* @__PURE__ */ new WeakMap();
    equalityCache.set(self, selfMap);
  } else if (selfMap.has(that)) {
    return selfMap.get(that);
  }
  const result2 = f(self, that);
  selfMap.set(that, result2);
  let thatMap = equalityCache.get(that);
  if (!thatMap) {
    thatMap = /* @__PURE__ */ new WeakMap();
    equalityCache.set(that, thatMap);
  }
  thatMap.set(self, result2);
  return result2;
}
const equalityCache = /* @__PURE__ */ new WeakMap();
function compareArrays(self, that) {
  for (let i = 0; i < self.length; i++) {
    if (!compareBoth(self[i], that[i])) {
      return false;
    }
  }
  return true;
}
function compareRecords(self, that) {
  const selfKeys = getAllObjectKeys(self);
  const thatKeys = getAllObjectKeys(that);
  if (selfKeys.size !== thatKeys.size) {
    return false;
  }
  for (const key of selfKeys) {
    if (!thatKeys.has(key) || !compareBoth(self[key], that[key])) {
      return false;
    }
  }
  return true;
}
function makeCompareMap(keyEquivalence, valueEquivalence) {
  return function compareMaps2(self, that) {
    for (const [selfKey, selfValue] of self) {
      let found = false;
      for (const [thatKey, thatValue] of that) {
        if (keyEquivalence(selfKey, thatKey) && valueEquivalence(selfValue, thatValue)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  };
}
const compareMaps = /* @__PURE__ */ makeCompareMap(compareBoth, compareBoth);
function makeCompareSet(equivalence) {
  return function compareSets2(self, that) {
    for (const selfValue of self) {
      let found = false;
      for (const thatValue of that) {
        if (equivalence(selfValue, thatValue)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  };
}
const compareSets = /* @__PURE__ */ makeCompareSet(compareBoth);
const isEqual = (u) => hasProperty(u, symbol);
const asEquivalence = () => equals;
const symbolRedactable = /* @__PURE__ */ Symbol.for("~effect/Inspectable/redactable");
const isRedactable = (u) => hasProperty(u, symbolRedactable);
function redact(u) {
  if (isRedactable(u)) return getRedacted(u);
  return u;
}
function getRedacted(redactable) {
  return redactable[symbolRedactable](globalThis[currentFiberTypeId]?.services ?? emptyServiceMap$1);
}
const currentFiberTypeId = "~effect/Fiber/currentFiber";
const emptyServiceMap$1 = {
  "~effect/ServiceMap": {},
  mapUnsafe: /* @__PURE__ */ new Map(),
  pipe() {
    return pipeArguments(this, arguments);
  }
};
function format(input, options) {
  const space = options?.space ?? 0;
  const seen = /* @__PURE__ */ new WeakSet();
  const gap = !space ? "" : typeof space === "number" ? " ".repeat(space) : space;
  const ind = (d) => gap.repeat(d);
  const wrap = (v, body) => {
    const ctor = v?.constructor;
    return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
  };
  const ownKeys = (o) => {
    try {
      return Reflect.ownKeys(o);
    } catch {
      return ["[ownKeys threw]"];
    }
  };
  function recur(v, d = 0) {
    if (Array.isArray(v)) {
      if (seen.has(v)) return CIRCULAR;
      seen.add(v);
      if (!gap || v.length <= 1) return `[${v.map((x) => recur(x, d)).join(",")}]`;
      const inner = v.map((x) => recur(x, d + 1)).join(",\n" + ind(d + 1));
      return `[
${ind(d + 1)}${inner}
${ind(d)}]`;
    }
    if (v instanceof Date) return formatDate(v);
    if (!options?.ignoreToString && hasProperty(v, "toString") && typeof v["toString"] === "function" && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
      const s = safeToString(v);
      if (v instanceof Error && v.cause) {
        return `${s} (cause: ${recur(v.cause, d)})`;
      }
      return s;
    }
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number" || v == null || typeof v === "boolean" || typeof v === "symbol") return String(v);
    if (typeof v === "bigint") return String(v) + "n";
    if (isObject(v)) {
      if (seen.has(v)) return CIRCULAR;
      seen.add(v);
      if (symbolRedactable in v) return format(getRedacted(v));
      if (Symbol.iterator in v) {
        return `${v.constructor.name}(${recur(Array.from(v), d)})`;
      }
      const keys = ownKeys(v);
      if (!gap || keys.length <= 1) {
        const body2 = `{${keys.map((k) => `${formatPropertyKey(k)}:${recur(v[k], d)}`).join(",")}}`;
        return wrap(v, body2);
      }
      const body = `{
${keys.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(v[k], d + 1)}`).join(",\n")}
${ind(d)}}`;
      return wrap(v, body);
    }
    return String(v);
  }
  return recur(input, 0);
}
const CIRCULAR = "[Circular]";
function formatPropertyKey(name) {
  return typeof name === "string" ? JSON.stringify(name) : String(name);
}
function formatDate(date) {
  try {
    return date.toISOString();
  } catch {
    return "Invalid Date";
  }
}
function safeToString(input) {
  try {
    const s = input.toString();
    return typeof s === "string" ? s : String(s);
  } catch {
    return "[toString threw]";
  }
}
function formatJson(input, options) {
  let cache = [];
  const out = JSON.stringify(input, (_key, value2) => typeof value2 === "object" && value2 !== null ? cache.includes(value2) ? void 0 : cache.push(value2) && redact(value2) : value2, options?.space);
  cache = void 0;
  return out;
}
const NodeInspectSymbol = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
const toJson = (input) => {
  try {
    if (hasProperty(input, "toJSON") && isFunction(input["toJSON"]) && input["toJSON"].length === 0) {
      return input.toJSON();
    } else if (Array.isArray(input)) {
      return input.map(toJson);
    }
  } catch {
    return "[toJSON threw]";
  }
  return redact(input);
};
const toStringUnknown = (u, whitespace = 2) => {
  if (typeof u === "string") {
    return u;
  }
  try {
    return typeof u === "object" ? stringifyCircular(u, whitespace) : String(u);
  } catch {
    return String(u);
  }
};
const stringifyCircular = (obj, whitespace) => {
  let cache = [];
  const retVal = JSON.stringify(obj, (_key, value2) => typeof value2 === "object" && value2 !== null ? cache.includes(value2) ? void 0 : cache.push(value2) && redact(value2) : value2, whitespace);
  cache = void 0;
  return retVal;
};
class SingleShotGen {
  called = false;
  self;
  constructor(self) {
    this.self = self;
  }
  /**
   * @since 2.0.0
   */
  next(a) {
    return this.called ? {
      value: a,
      done: true
    } : (this.called = true, {
      value: this.self,
      done: false
    });
  }
  /**
   * @since 2.0.0
   */
  [Symbol.iterator]() {
    return new SingleShotGen(this.self);
  }
}
const InternalTypeId = "~effect/Effect/internal";
const standard = {
  [InternalTypeId]: (body) => {
    return body();
  }
};
const forced = {
  [InternalTypeId]: (body) => {
    try {
      return body();
    } finally {
    }
  }
};
const isNotOptimizedAway = /* @__PURE__ */ standard[InternalTypeId](() => new Error().stack)?.includes(InternalTypeId) === true;
const internalCall = isNotOptimizedAway ? standard[InternalTypeId] : forced[InternalTypeId];
const EffectTypeId = `~effect/Effect`;
const ExitTypeId = `~effect/Exit`;
const effectVariance = {
  _A: identity,
  _E: identity,
  _R: identity
};
const identifier = `${EffectTypeId}/identifier`;
const args = `${EffectTypeId}/args`;
const evaluate = `${EffectTypeId}/evaluate`;
const contA = `${EffectTypeId}/successCont`;
const contE = `${EffectTypeId}/failureCont`;
const contAll = `${EffectTypeId}/ensureCont`;
const Yield = /* @__PURE__ */ Symbol.for("effect/Effect/Yield");
const PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments);
  },
  toJSON() {
    return {
      ...this
    };
  },
  toString() {
    return format(this, {
      ignoreToString: true
    });
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
const YieldableProto = {
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
const EffectProto = {
  [EffectTypeId]: effectVariance,
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  },
  asEffect() {
    return this;
  },
  toJSON() {
    return {
      _id: "Effect",
      op: this[identifier],
      ...args in this ? {
        args: this[args]
      } : void 0
    };
  }
};
const isEffect = (u) => hasProperty(u, EffectTypeId);
const isExit = (u) => hasProperty(u, ExitTypeId);
const CauseTypeId = "~effect/Cause";
const CauseReasonTypeId = "~effect/Cause/Reason";
const isCause = (self) => hasProperty(self, CauseTypeId);
class CauseImpl {
  [CauseTypeId];
  reasons;
  constructor(failures) {
    this[CauseTypeId] = CauseTypeId;
    this.reasons = failures;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toJSON() {
    return {
      _id: "Cause",
      failures: this.reasons.map((f) => f.toJSON())
    };
  }
  toString() {
    return `Cause(${format(this.reasons)})`;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  [symbol](that) {
    return isCause(that) && this.reasons.length === that.reasons.length && this.reasons.every((e, i) => equals(e, that.reasons[i]));
  }
  [symbol$1]() {
    return array(this.reasons);
  }
}
const annotationsMap = /* @__PURE__ */ new WeakMap();
class ReasonBase {
  [CauseReasonTypeId];
  annotations;
  _tag;
  constructor(_tag, annotations, originalError) {
    this[CauseReasonTypeId] = CauseReasonTypeId;
    this._tag = _tag;
    if (annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null && annotations.size > 0) {
      const prevAnnotations = annotationsMap.get(originalError);
      if (prevAnnotations) {
        annotations = new Map([...prevAnnotations, ...annotations]);
      }
      annotationsMap.set(originalError, annotations);
    }
    this.annotations = annotations;
  }
  annotate(annotations, options) {
    if (annotations.mapUnsafe.size === 0) return this;
    const newAnnotations = new Map(this.annotations);
    annotations.mapUnsafe.forEach((value2, key) => {
      if (options?.overwrite !== true && newAnnotations.has(key)) return;
      newAnnotations.set(key, value2);
    });
    const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    self.annotations = newAnnotations;
    return self;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toString() {
    return format(this);
  }
  [NodeInspectSymbol]() {
    return this.toString();
  }
}
const constEmptyAnnotations = /* @__PURE__ */ new Map();
class Fail extends ReasonBase {
  error;
  constructor(error, annotations = constEmptyAnnotations) {
    super("Fail", annotations, error);
    this.error = error;
  }
  toString() {
    return `Fail(${format(this.error)})`;
  }
  toJSON() {
    return {
      _tag: "Fail",
      error: this.error
    };
  }
  [symbol](that) {
    return isFailReason(that) && equals(this.error, that.error) && equals(this.annotations, that.annotations);
  }
  [symbol$1]() {
    return combine(string(this._tag))(combine(hash(this.error))(hash(this.annotations)));
  }
}
const causeFromReasons = (reasons) => new CauseImpl(reasons);
const causeEmpty = /* @__PURE__ */ new CauseImpl([]);
const causeFail = (error) => new CauseImpl([new Fail(error)]);
class Die extends ReasonBase {
  defect;
  constructor(defect, annotations = constEmptyAnnotations) {
    super("Die", annotations, defect);
    this.defect = defect;
  }
  toString() {
    return `Die(${format(this.defect)})`;
  }
  toJSON() {
    return {
      _tag: "Die",
      defect: this.defect
    };
  }
  [symbol](that) {
    return isDieReason(that) && equals(this.defect, that.defect) && equals(this.annotations, that.annotations);
  }
  [symbol$1]() {
    return combine(string(this._tag))(combine(hash(this.defect))(hash(this.annotations)));
  }
}
const causeDie = (defect) => new CauseImpl([new Die(defect)]);
const causeAnnotate = /* @__PURE__ */ dual((args2) => isCause(args2[0]), (self, annotations, options) => {
  if (annotations.mapUnsafe.size === 0) return self;
  return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)));
});
const isFailReason = (self) => self._tag === "Fail";
const isDieReason = (self) => self._tag === "Die";
const isInterruptReason = (self) => self._tag === "Interrupt";
function defaultEvaluate(_fiber) {
  return exitDie(`Effect.evaluate: Not implemented`);
}
const makePrimitiveProto = (options) => ({
  ...EffectProto,
  [identifier]: options.op,
  [evaluate]: options[evaluate] ?? defaultEvaluate,
  [contA]: options[contA],
  [contE]: options[contE],
  [contAll]: options[contAll]
});
const makePrimitive = (options) => {
  const Proto2 = makePrimitiveProto(options);
  return function() {
    const self = Object.create(Proto2);
    self[args] = options.single === false ? arguments : arguments[0];
    return self;
  };
};
const makeExit = (options) => {
  const Proto2 = {
    ...makePrimitiveProto(options),
    [ExitTypeId]: ExitTypeId,
    _tag: options.op,
    get [options.prop]() {
      return this[args];
    },
    toString() {
      return `${options.op}(${format(this[args])})`;
    },
    toJSON() {
      return {
        _id: "Exit",
        _tag: options.op,
        [options.prop]: this[args]
      };
    },
    [symbol](that) {
      return isExit(that) && that._tag === this._tag && equals(this[args], that[args]);
    },
    [symbol$1]() {
      return combine(string(options.op), hash(this[args]));
    }
  };
  return function(value2) {
    const self = Object.create(Proto2);
    self[args] = value2;
    return self;
  };
};
const exitSucceed = /* @__PURE__ */ makeExit({
  op: "Success",
  prop: "value",
  [evaluate](fiber) {
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this);
  }
});
const StackTraceKey = {
  key: "effect/Cause/StackTrace"
};
const InterruptorStackTrace = {
  key: "effect/Cause/InterruptorStackTrace"
};
const exitFailCause = /* @__PURE__ */ makeExit({
  op: "Failure",
  prop: "cause",
  [evaluate](fiber) {
    let cause = this[args];
    let annotated = false;
    if (fiber.currentStackFrame) {
      cause = causeAnnotate(cause, {
        mapUnsafe: /* @__PURE__ */ new Map([[StackTraceKey.key, fiber.currentStackFrame]])
      });
      annotated = true;
    }
    let cont = fiber.getCont(contE);
    while (fiber.interruptible && fiber._interruptedCause && cont) {
      cont = fiber.getCont(contE);
    }
    return cont ? cont[contE](cause, fiber, annotated ? void 0 : this) : fiber.yieldWith(annotated ? this : exitFailCause(cause));
  }
});
const exitFail = (e) => exitFailCause(causeFail(e));
const exitDie = (defect) => exitFailCause(causeDie(defect));
const withFiber = /* @__PURE__ */ makePrimitive({
  op: "WithFiber",
  [evaluate](fiber) {
    return this[args](fiber);
  }
});
const YieldableError = /* @__PURE__ */ (function() {
  class YieldableError2 extends globalThis.Error {
    asEffect() {
      return exitFail(this);
    }
  }
  Object.assign(YieldableError2.prototype, YieldableProto);
  return YieldableError2;
})();
const Error$1 = /* @__PURE__ */ (function() {
  const plainArgsSymbol = /* @__PURE__ */ Symbol.for("effect/Data/Error/plainArgs");
  return class Base extends YieldableError {
    constructor(args2) {
      super(args2?.message, args2?.cause ? {
        cause: args2.cause
      } : void 0);
      if (args2) {
        Object.assign(this, args2);
        Object.defineProperty(this, plainArgsSymbol, {
          value: args2,
          enumerable: false
        });
      }
    }
    toJSON() {
      return {
        ...this[plainArgsSymbol],
        ...this
      };
    }
  };
})();
const TaggedError$1 = (tag) => {
  class Base extends Error$1 {
    _tag = tag;
  }
  Base.prototype.name = tag;
  return Base;
};
const NoSuchElementErrorTypeId = "~effect/Cause/NoSuchElementError";
class NoSuchElementError extends (/* @__PURE__ */ TaggedError$1("NoSuchElementError")) {
  [NoSuchElementErrorTypeId] = NoSuchElementErrorTypeId;
  constructor(message) {
    super({
      message
    });
  }
}
const TypeId$5 = "~effect/data/Option";
const CommonProto$1 = {
  [TypeId$5]: {
    _A: (_) => _
  },
  ...PipeInspectableProto,
  ...YieldableProto
};
const SomeProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto$1), {
  _tag: "Some",
  _op: "Some",
  [symbol](that) {
    return isOption(that) && isSome(that) && equals(this.value, that.value);
  },
  [symbol$1]() {
    return combine(hash(this._tag))(hash(this.value));
  },
  toString() {
    return `some(${format(this.value)})`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag,
      value: toJson(this.value)
    };
  },
  asEffect() {
    return exitSucceed(this.value);
  }
});
const NoneHash = /* @__PURE__ */ hash("None");
const NoneProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto$1), {
  _tag: "None",
  _op: "None",
  [symbol](that) {
    return isOption(that) && isNone(that);
  },
  [symbol$1]() {
    return NoneHash;
  },
  toString() {
    return `none()`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag
    };
  },
  asEffect() {
    return exitFail(new NoSuchElementError());
  }
});
const isOption = (input) => hasProperty(input, TypeId$5);
const isNone = (fa) => fa._tag === "None";
const isSome = (fa) => fa._tag === "Some";
const none$1 = /* @__PURE__ */ Object.create(NoneProto);
const some$1 = (value2) => {
  const a = Object.create(SomeProto);
  a.value = value2;
  return a;
};
const TypeId$4 = "~effect/data/Result";
const CommonProto = {
  [TypeId$4]: {
    /* v8 ignore next 2 */
    _A: (_) => _,
    _E: (_) => _
  },
  ...PipeInspectableProto,
  ...YieldableProto
};
const SuccessProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "Success",
  _op: "Success",
  [symbol](that) {
    return isResult$1(that) && isSuccess$2(that) && equals(this.success, that.success);
  },
  [symbol$1]() {
    return combine(hash(this._tag))(hash(this.success));
  },
  toString() {
    return `success(${format(this.success)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      value: toJson(this.success)
    };
  },
  asEffect() {
    return exitSucceed(this.success);
  }
});
const FailureProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "Failure",
  _op: "Failure",
  [symbol](that) {
    return isResult$1(that) && isFailure$1(that) && equals(this.failure, that.failure);
  },
  [symbol$1]() {
    return combine(hash(this._tag))(hash(this.failure));
  },
  toString() {
    return `failure(${format(this.failure)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      failure: toJson(this.failure)
    };
  },
  asEffect() {
    return exitFail(this.failure);
  }
});
const isResult$1 = (input) => hasProperty(input, TypeId$4);
const isFailure$1 = (result2) => result2._tag === "Failure";
const isSuccess$2 = (result2) => result2._tag === "Success";
const fail$3 = (failure) => {
  const a = Object.create(FailureProto);
  a.failure = failure;
  return a;
};
const succeed$4 = (success) => {
  const a = Object.create(SuccessProto);
  a.success = success;
  return a;
};
function make$1(compare) {
  return (self, that) => self === that ? 0 : compare(self, that);
}
const Number$1 = /* @__PURE__ */ make$1((self, that) => {
  if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that)) return 0;
  if (globalThis.Number.isNaN(self)) return -1;
  if (globalThis.Number.isNaN(that)) return 1;
  return self < that ? -1 : 1;
});
const mapInput = /* @__PURE__ */ dual(2, (self, f) => make$1((b1, b2) => self(f(b1), f(b2))));
const isGreaterThan = (O) => dual(2, (self, that) => O(self, that) === 1);
const none = () => none$1;
const some = some$1;
const succeed$3 = succeed$4;
const fail$2 = fail$3;
const isResult = isResult$1;
const isFailure = isFailure$1;
const isSuccess$1 = isSuccess$2;
const apply = (filter, input, ...args2) => {
  const result2 = filter(input, ...args2);
  if (result2 === true) return succeed$3(input);
  if (result2 === false) return fail$2(input);
  return result2;
};
const isArrayNonEmpty = (self) => self.length > 0;
const Array$1 = globalThis.Array;
const fromIterable = (collection) => Array$1.isArray(collection) ? collection : Array$1.from(collection);
const appendAll = /* @__PURE__ */ dual(2, (self, that) => fromIterable(self).concat(fromIterable(that)));
const isReadonlyArrayNonEmpty = isArrayNonEmpty;
function isOutOfBounds(i, as2) {
  return i < 0 || i >= as2.length;
}
const getUnsafe$1 = /* @__PURE__ */ dual(2, (self, index) => {
  const i = Math.floor(index);
  if (isOutOfBounds(i, self)) {
    throw new Error(`Index out of bounds: ${i}`);
  }
  return self[i];
});
const headNonEmpty = /* @__PURE__ */ getUnsafe$1(0);
const tailNonEmpty = (self) => self.slice(1);
const unionWith = /* @__PURE__ */ dual(3, (self, that, isEquivalent) => {
  const a = fromIterable(self);
  const b = fromIterable(that);
  if (isReadonlyArrayNonEmpty(a)) {
    if (isReadonlyArrayNonEmpty(b)) {
      const dedupe = dedupeWith(isEquivalent);
      return dedupe(appendAll(a, b));
    }
    return a;
  }
  return b;
});
const union = /* @__PURE__ */ dual(2, (self, that) => unionWith(self, that, asEquivalence()));
const dedupeWith = /* @__PURE__ */ dual(2, (self, isEquivalent) => {
  const input = fromIterable(self);
  if (isReadonlyArrayNonEmpty(input)) {
    const out = [headNonEmpty(input)];
    const rest = tailNonEmpty(input);
    for (const r of rest) {
      if (out.every((a) => !isEquivalent(r, a))) {
        out.push(r);
      }
    }
    return out;
  }
  return [];
});
const toMillis = (self) => match$1(self, {
  onMillis: identity,
  onNanos: (nanos) => Number(nanos) / 1e6,
  onInfinity: () => Infinity,
  onNegativeInfinity: () => -Infinity
});
const match$1 = /* @__PURE__ */ dual(2, (self, options) => {
  switch (self.value._tag) {
    case "Millis":
      return options.onMillis(self.value.millis);
    case "Nanos":
      return options.onNanos(self.value.nanos);
    case "Infinity":
      return options.onInfinity();
    case "NegativeInfinity":
      return (options.onNegativeInfinity ?? options.onInfinity)();
  }
});
const ServiceTypeId = "~effect/ServiceMap/Service";
const Service = function() {
  const prevLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 2;
  const err = new Error();
  Error.stackTraceLimit = prevLimit;
  function KeyClass() {
  }
  const self = KeyClass;
  Object.setPrototypeOf(self, ServiceProto);
  Object.defineProperty(self, "stack", {
    get() {
      return err.stack;
    }
  });
  if (arguments.length > 0) {
    self.key = arguments[0];
    if (arguments[1]?.defaultValue) {
      self[ReferenceTypeId] = ReferenceTypeId;
      self.defaultValue = arguments[1].defaultValue;
    }
    return self;
  }
  return function(key, options) {
    self.key = key;
    if (options?.make) {
      self.make = options.make;
    }
    return self;
  };
};
const ServiceProto = {
  [ServiceTypeId]: {
    _Service: (_) => _,
    _Identifier: (_) => _
  },
  ...PipeInspectableProto,
  ...YieldableProto,
  toJSON() {
    return {
      _id: "Service",
      key: this.key,
      stack: this.stack
    };
  },
  asEffect() {
    const fn = this.asEffect = constant(withFiber((fiber) => exitSucceed(get(fiber.services, this))));
    return fn();
  },
  of(self) {
    return self;
  },
  serviceMap(self) {
    return make(this, self);
  },
  use(f) {
    return withFiber((fiber) => f(get(fiber.services, this)));
  },
  useSync(f) {
    return withFiber((fiber) => exitSucceed(f(get(fiber.services, this))));
  }
};
const ReferenceTypeId = "~effect/ServiceMap/Reference";
const TypeId$3 = "~effect/ServiceMap";
const makeUnsafe$2 = (mapUnsafe) => {
  const self = Object.create(Proto);
  self.mapUnsafe = mapUnsafe;
  return self;
};
const Proto = {
  ...PipeInspectableProto,
  [TypeId$3]: {
    _Services: (_) => _
  },
  toJSON() {
    return {
      _id: "ServiceMap",
      services: Array.from(this.mapUnsafe).map(([key, value2]) => ({
        key,
        value: value2
      }))
    };
  },
  [symbol](that) {
    if (!isServiceMap(that) || this.mapUnsafe.size !== that.mapUnsafe.size) return false;
    for (const k of this.mapUnsafe.keys()) {
      if (!that.mapUnsafe.has(k) || !equals(this.mapUnsafe.get(k), that.mapUnsafe.get(k))) {
        return false;
      }
    }
    return true;
  },
  [symbol$1]() {
    return number(this.mapUnsafe.size);
  }
};
const isServiceMap = (u) => hasProperty(u, TypeId$3);
const isReference = (u) => hasProperty(u, ReferenceTypeId);
const empty = () => emptyServiceMap;
const emptyServiceMap = /* @__PURE__ */ makeUnsafe$2(/* @__PURE__ */ new Map());
const make = (key, service) => makeUnsafe$2(/* @__PURE__ */ new Map([[key.key, service]]));
const add = /* @__PURE__ */ dual(3, (self, key, service) => {
  const map2 = new Map(self.mapUnsafe);
  map2.set(key.key, service);
  return makeUnsafe$2(map2);
});
const addOrOmit = /* @__PURE__ */ dual(3, (self, key, service) => {
  const map2 = new Map(self.mapUnsafe);
  if (service._tag === "None") {
    map2.delete(key.key);
  } else {
    map2.set(key.key, service.value);
  }
  return makeUnsafe$2(map2);
});
const getOrElse = /* @__PURE__ */ dual(3, (self, key, orElse2) => {
  if (self.mapUnsafe.has(key.key)) {
    return self.mapUnsafe.get(key.key);
  }
  return isReference(key) ? getDefaultValue(key) : orElse2();
});
const getUnsafe = /* @__PURE__ */ dual(2, (self, service) => {
  if (!self.mapUnsafe.has(service.key)) {
    if (ReferenceTypeId in service) return getDefaultValue(service);
    throw serviceNotFoundError(service);
  }
  return self.mapUnsafe.get(service.key);
});
const get = getUnsafe;
const getReferenceUnsafe = (self, service) => {
  if (!self.mapUnsafe.has(service.key)) {
    return getDefaultValue(service);
  }
  return self.mapUnsafe.get(service.key);
};
const defaultValueCacheKey = "~effect/ServiceMap/defaultValue";
const getDefaultValue = (ref) => {
  if (defaultValueCacheKey in ref) {
    return ref[defaultValueCacheKey];
  }
  return ref[defaultValueCacheKey] = ref.defaultValue();
};
const serviceNotFoundError = (service) => {
  const error = new Error(`Service not found${service.key ? `: ${String(service.key)}` : ""}`);
  if (service.stack) {
    const lines = service.stack.split("\n");
    if (lines.length > 2) {
      const afterAt = lines[2].match(/at (.*)/);
      if (afterAt) {
        error.message = error.message + ` (defined at ${afterAt[1]})`;
      }
    }
  }
  if (error.stack) {
    const lines = error.stack.split("\n");
    lines.splice(1, 3);
    error.stack = lines.join("\n");
  }
  return error;
};
const getOption = /* @__PURE__ */ dual(2, (self, service) => {
  if (self.mapUnsafe.has(service.key)) {
    return some(self.mapUnsafe.get(service.key));
  }
  return isReference(service) ? some(getDefaultValue(service)) : none();
});
const merge = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.mapUnsafe.size === 0) return that;
  if (that.mapUnsafe.size === 0) return self;
  const map2 = new Map(self.mapUnsafe);
  that.mapUnsafe.forEach((value2, key) => map2.set(key, value2));
  return makeUnsafe$2(map2);
});
const mergeAll$1 = (...ctxs) => {
  const map2 = /* @__PURE__ */ new Map();
  for (let i = 0; i < ctxs.length; i++) {
    ctxs[i].mapUnsafe.forEach((value2, key) => {
      map2.set(key, value2);
    });
  }
  return makeUnsafe$2(map2);
};
const Reference = Service;
const Scheduler = /* @__PURE__ */ Reference("effect/Scheduler", {
  defaultValue: () => new MixedScheduler()
});
const setImmediate = "setImmediate" in globalThis ? (f) => {
  const timer = globalThis.setImmediate(f);
  return () => globalThis.clearImmediate(timer);
} : (f) => {
  const timer = setTimeout(f, 0);
  return () => clearTimeout(timer);
};
class PriorityBuckets {
  buckets = [];
  scheduleTask(task, priority) {
    const buckets = this.buckets;
    const len = buckets.length;
    let bucket;
    let index = 0;
    for (; index < len; index++) {
      if (buckets[index][0] > priority) break;
      bucket = buckets[index];
    }
    if (bucket && bucket[0] === priority) {
      bucket[1].push(task);
    } else if (index === len) {
      buckets.push([priority, [task]]);
    } else {
      buckets.splice(index, 0, [priority, [task]]);
    }
  }
  drain() {
    const buckets = this.buckets;
    this.buckets = [];
    return buckets;
  }
}
class MixedScheduler {
  tasks = /* @__PURE__ */ new PriorityBuckets();
  running = void 0;
  executionMode;
  setImmediate;
  constructor(executionMode = "async", setImmediateFn = setImmediate) {
    this.executionMode = executionMode;
    this.setImmediate = setImmediateFn;
  }
  /**
   * @since 2.0.0
   */
  scheduleTask(task, priority) {
    this.tasks.scheduleTask(task, priority);
    if (this.running === void 0) {
      this.running = this.setImmediate(this.afterScheduled);
    }
  }
  /**
   * @since 2.0.0
   */
  afterScheduled = () => {
    this.running = void 0;
    this.runTasks();
  };
  /**
   * @since 2.0.0
   */
  runTasks() {
    const buckets = this.tasks.drain();
    for (let i = 0; i < buckets.length; i++) {
      const toRun = buckets[i][1];
      for (let j = 0; j < toRun.length; j++) {
        toRun[j]();
      }
    }
  }
  /**
   * @since 2.0.0
   */
  shouldYield(fiber) {
    return fiber.currentOpCount >= fiber.maxOpsBeforeYield;
  }
  /**
   * @since 2.0.0
   */
  flush() {
    while (this.tasks.buckets.length > 0) {
      if (this.running !== void 0) {
        this.running();
        this.running = void 0;
      }
      this.runTasks();
    }
  }
}
const MaxOpsBeforeYield = /* @__PURE__ */ Reference("effect/Scheduler/MaxOpsBeforeYield", {
  defaultValue: () => 2048
});
const ParentSpanKey = "effect/Tracer/ParentSpan";
const TracerKey = "effect/Tracer";
const CurrentConcurrency = /* @__PURE__ */ Reference("effect/References/CurrentConcurrency", {
  defaultValue: () => "unbounded"
});
const CurrentStackFrame = /* @__PURE__ */ Reference("effect/References/CurrentStackFrame", {
  defaultValue: constUndefined
});
const CurrentLogAnnotations = /* @__PURE__ */ Reference("effect/References/CurrentLogAnnotations", {
  defaultValue: () => ({})
});
const CurrentLogLevel = /* @__PURE__ */ Reference("effect/References/CurrentLogLevel", {
  defaultValue: () => "Info"
});
const MinimumLogLevel = /* @__PURE__ */ Reference("effect/References/MinimumLogLevel", {
  defaultValue: () => "Info"
});
const CurrentLogSpans = /* @__PURE__ */ Reference("effect/References/CurrentLogSpans", {
  defaultValue: () => []
});
const FiberRuntimeMetricsKey = "effect/observability/Metric/FiberRuntimeMetricsKey";
const version = "dev";
class Interrupt extends ReasonBase {
  fiberId;
  constructor(fiberId, annotations = constEmptyAnnotations) {
    super("Interrupt", annotations, "Interrupted");
    this.fiberId = fiberId;
  }
  toString() {
    return `Interrupt(${this.fiberId})`;
  }
  toJSON() {
    return {
      _tag: "Interrupt",
      fiberId: this.fiberId
    };
  }
  [symbol](that) {
    return isInterruptReason(that) && this.fiberId === that.fiberId && this.annotations === that.annotations;
  }
  [symbol$1]() {
    return combine(string(`${this._tag}:${this.fiberId}`))(random(this.annotations));
  }
}
const causeInterrupt = (fiberId) => new CauseImpl([new Interrupt(fiberId)]);
const findError = (self) => {
  for (let i = 0; i < self.reasons.length; i++) {
    const reason = self.reasons[i];
    if (reason._tag === "Fail") {
      return succeed$3(reason.error);
    }
  }
  return fail$2(self);
};
const hasInterrupts = (self) => self.reasons.some(isInterruptReason);
const causeCombine = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.reasons.length === 0) {
    return that;
  } else if (that.reasons.length === 0) {
    return self;
  }
  const newCause = new CauseImpl(union(self.reasons, that.reasons));
  return equals(self, newCause) ? self : newCause;
});
const causePartition = (self) => {
  const obj = {
    Fail: [],
    Die: [],
    Interrupt: []
  };
  for (let i = 0; i < self.reasons.length; i++) {
    obj[self.reasons[i]._tag].push(self.reasons[i]);
  }
  return obj;
};
const causeSquash = (self) => {
  const partitioned = causePartition(self);
  if (partitioned.Fail.length > 0) {
    return partitioned.Fail[0].error;
  } else if (partitioned.Die.length > 0) {
    return partitioned.Die[0].defect;
  } else if (partitioned.Interrupt.length > 0) {
    return new globalThis.Error("All fibers interrupted without error");
  }
  return new globalThis.Error("Empty cause");
};
const causePrettyErrors = (self) => {
  const errors = [];
  const interrupts = [];
  if (self.reasons.length === 0) return errors;
  const prevStackLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 1;
  for (const failure of self.reasons) {
    if (failure._tag === "Interrupt") {
      interrupts.push(failure);
      continue;
    }
    errors.push(causePrettyError(failure._tag === "Die" ? failure.defect : failure.error, failure.annotations));
  }
  if (errors.length === 0) {
    const cause = new Error("The fiber was interrupted by:");
    cause.name = "InterruptCause";
    cause.stack = interruptCauseStack(cause, interrupts);
    const error = new globalThis.Error("All fibers interrupted without error", {
      cause
    });
    error.name = "InterruptError";
    error.stack = `${error.name}: ${error.message}`;
    errors.push(causePrettyError(error, interrupts[0].annotations));
  }
  Error.stackTraceLimit = prevStackLimit;
  return errors;
};
const causePrettyError = (original, annotations) => {
  const kind = typeof original;
  let error;
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause) : void 0
    });
    if (typeof original.name === "string") {
      error.name = original.name;
    }
    if (typeof original.stack === "string") {
      error.stack = cleanErrorStack(original.stack, error, annotations);
    } else {
      const stack = `${error.name}: ${error.message}`;
      error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
    }
    for (const key of Object.keys(original)) {
      if (!(key in error)) {
        error[key] = original[key];
      }
    }
  } else {
    error = new globalThis.Error(!original ? `Unknown error: ${original}` : kind === "string" ? original : formatJson(original));
  }
  return error;
};
const causePrettyMessage = (u) => {
  if (typeof u.message === "string") {
    return u.message;
  } else if (typeof u.toString === "function" && u.toString !== Object.prototype.toString && u.toString !== Array.prototype.toString) {
    try {
      return u.toString();
    } catch {
    }
  }
  return formatJson(u);
};
const locationRegExp = /\((.*)\)/g;
const cleanErrorStack = (stack, error, annotations) => {
  const message = `${error.name}: ${error.message}`;
  const lines = (stack.startsWith(message) ? stack.slice(message.length) : stack).split("\n");
  const out = [message];
  for (let i = 1; i < lines.length; i++) {
    if (/(?:Generator\.next|~effect\/Effect)/.test(lines[i])) {
      break;
    }
    out.push(lines[i]);
  }
  return annotations ? addStackAnnotations(out.join("\n"), annotations) : out.join("\n");
};
const addStackAnnotations = (stack, annotations) => {
  const frame = annotations?.get(StackTraceKey.key);
  if (frame) {
    stack = `${stack}
${currentStackTrace(frame)}`;
  }
  return stack;
};
const interruptCauseStack = (error, interrupts) => {
  const out = [`${error.name}: ${error.message}`];
  for (const current of interrupts) {
    const fiberId = current.fiberId !== void 0 ? `#${current.fiberId}` : "unknown";
    const frame = current.annotations.get(InterruptorStackTrace.key);
    out.push(`    at fiber (${fiberId})`);
    if (frame) out.push(currentStackTrace(frame));
  }
  return out.join("\n");
};
const currentStackTrace = (frame) => {
  const out = [];
  let current = frame;
  let i = 0;
  while (current && i < 10) {
    const stack = current.stack();
    if (stack) {
      const locationMatchAll = stack.matchAll(locationRegExp);
      let match2 = false;
      for (const [, location] of locationMatchAll) {
        match2 = true;
        out.push(`    at ${current.name} (${location})`);
      }
      if (!match2) {
        out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`);
      }
    } else {
      out.push(`    at ${current.name}`);
    }
    current = current.parent;
    i++;
  }
  return out.join("\n");
};
const causePretty = (cause) => causePrettyErrors(cause).map((e) => e.cause ? `${e.stack} {
${renderErrorCause(e.cause, "  ")}
}` : e.stack).join("\n");
const renderErrorCause = (cause, prefix) => {
  const lines = cause.stack.split("\n");
  let stack = `${prefix}[cause]: ${lines[0]}`;
  for (let i = 1, len = lines.length; i < len; i++) {
    stack += `
${prefix}${lines[i]}`;
  }
  if (cause.cause) {
    stack += ` {
${renderErrorCause(cause.cause, `${prefix}  `)}
${prefix}}`;
  }
  return stack;
};
const FiberTypeId = `~effect/Fiber/${version}`;
const fiberVariance = {
  _A: identity,
  _E: identity
};
const fiberIdStore = {
  id: 0
};
const getCurrentFiber = () => globalThis[currentFiberTypeId];
const keepAlive = /* @__PURE__ */ (() => {
  let count = 0;
  let running = void 0;
  return {
    increment() {
      count++;
      running ??= globalThis.setInterval(constVoid, 2147483647);
    },
    decrement() {
      count--;
      if (count === 0 && running !== void 0) {
        globalThis.clearInterval(running);
        running = void 0;
      }
    }
  };
})();
class FiberImpl {
  constructor(services, interruptible = true) {
    this[FiberTypeId] = fiberVariance;
    this.setServices(services);
    this.id = ++fiberIdStore.id;
    this.currentOpCount = 0;
    this.currentLoopCount = 0;
    this.interruptible = interruptible;
    this._stack = [];
    this._observers = [];
    this._exit = void 0;
    this._children = void 0;
    this._interruptedCause = void 0;
    this._yielded = void 0;
  }
  [FiberTypeId];
  id;
  interruptible;
  currentOpCount;
  currentLoopCount;
  _stack;
  _observers;
  _exit;
  _currentExit;
  _children;
  _interruptedCause;
  _yielded;
  // set in setServices
  services;
  currentScheduler;
  currentTracerContext;
  currentSpan;
  currentLogLevel;
  minimumLogLevel;
  currentStackFrame;
  runtimeMetrics;
  maxOpsBeforeYield;
  getRef(ref) {
    return getReferenceUnsafe(this.services, ref);
  }
  addObserver(cb) {
    if (this._exit) {
      cb(this._exit);
      return constVoid;
    }
    this._observers.push(cb);
    return () => {
      const index = this._observers.indexOf(cb);
      if (index >= 0) {
        this._observers.splice(index, 1);
      }
    };
  }
  interruptUnsafe(fiberId, annotations) {
    if (this._exit) {
      return;
    }
    let cause = causeInterrupt(fiberId);
    if (this.currentStackFrame) {
      cause = causeAnnotate(cause, make(StackTraceKey, this.currentStackFrame));
    }
    if (annotations) {
      cause = causeAnnotate(cause, annotations);
    }
    this._interruptedCause = this._interruptedCause ? causeCombine(this._interruptedCause, cause) : cause;
    if (this.interruptible) {
      this.evaluate(failCause(this._interruptedCause));
    }
  }
  pollUnsafe() {
    return this._exit;
  }
  evaluate(effect2) {
    this.runtimeMetrics?.recordFiberStart(this.services);
    if (this._exit) {
      return;
    } else if (this._yielded !== void 0) {
      const yielded = this._yielded;
      this._yielded = void 0;
      yielded();
    }
    const exit2 = this.runLoop(effect2);
    if (exit2 === Yield) {
      return;
    }
    this._exit = exit2;
    this.runtimeMetrics?.recordFiberEnd(this.services, this._exit);
    for (let i = 0; i < this._observers.length; i++) {
      this._observers[i](exit2);
    }
    this._observers.length = 0;
  }
  runLoop(effect2) {
    const prevFiber = globalThis[currentFiberTypeId];
    globalThis[currentFiberTypeId] = this;
    let yielding = false;
    let current = effect2;
    this.currentOpCount = 0;
    const currentLoop = ++this.currentLoopCount;
    try {
      while (true) {
        this.currentOpCount++;
        if (!yielding && this.currentScheduler.shouldYield(this)) {
          yielding = true;
          const prev = current;
          current = flatMap$1(yieldNow, () => prev);
        }
        current = this.currentTracerContext ? this.currentTracerContext(current, this) : current[evaluate](this);
        if (currentLoop !== this.currentLoopCount) {
          return Yield;
        } else if (current === Yield) {
          const yielded = this._yielded;
          if (ExitTypeId in yielded) {
            this._yielded = void 0;
            return yielded;
          }
          return Yield;
        }
      }
    } catch (error) {
      if (!hasProperty(current, evaluate)) {
        return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`);
      }
      return this.runLoop(exitDie(error));
    } finally {
      globalThis[currentFiberTypeId] = prevFiber;
    }
  }
  getCont(symbol2) {
    while (true) {
      const op = this._stack.pop();
      if (!op) return void 0;
      const cont = op[contAll] && op[contAll](this);
      if (cont) {
        cont[symbol2] = cont;
        return cont;
      }
      if (op[symbol2]) return op;
    }
  }
  yieldWith(value2) {
    this._yielded = value2;
    return Yield;
  }
  children() {
    return this._children ??= /* @__PURE__ */ new Set();
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  setServices(services) {
    this.services = services;
    this.currentScheduler = this.getRef(Scheduler);
    this.currentSpan = services.mapUnsafe.get(ParentSpanKey);
    this.currentLogLevel = this.getRef(CurrentLogLevel);
    this.minimumLogLevel = this.getRef(MinimumLogLevel);
    this.currentStackFrame = services.mapUnsafe.get(CurrentStackFrame.key);
    this.maxOpsBeforeYield = this.getRef(MaxOpsBeforeYield);
    this.runtimeMetrics = services.mapUnsafe.get(FiberRuntimeMetricsKey);
    const currentTracer = services.mapUnsafe.get(TracerKey);
    this.currentTracerContext = currentTracer ? currentTracer["context"] : void 0;
  }
  get currentSpanLocal() {
    return this.currentSpan?._tag === "Span" ? this.currentSpan : void 0;
  }
}
const fiberStackAnnotations = (fiber) => {
  if (!fiber.currentStackFrame) return void 0;
  const annotations = /* @__PURE__ */ new Map();
  annotations.set(StackTraceKey.key, fiber.currentStackFrame);
  return makeUnsafe$2(annotations);
};
const fiberAwaitAll = (self) => callback((resume) => {
  const iter = self[Symbol.iterator]();
  const exits = [];
  let cancel = void 0;
  function loop() {
    let result2 = iter.next();
    while (!result2.done) {
      if (result2.value._exit) {
        exits.push(result2.value._exit);
        result2 = iter.next();
        continue;
      }
      cancel = result2.value.addObserver((exit2) => {
        exits.push(exit2);
        loop();
      });
      return;
    }
    resume(succeed$2(exits));
  }
  loop();
  return sync$1(() => cancel?.());
});
const fiberInterruptAll = (fibers) => withFiber((parent) => {
  const annotations = fiberStackAnnotations(parent);
  for (const fiber of fibers) {
    fiber.interruptUnsafe(parent.id, annotations);
  }
  return asVoid(fiberAwaitAll(fibers));
});
const succeed$2 = exitSucceed;
const failCause = exitFailCause;
const fail$1 = exitFail;
const sync$1 = /* @__PURE__ */ makePrimitive({
  op: "Sync",
  [evaluate](fiber) {
    const value2 = this[args]();
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value2, fiber) : fiber.yieldWith(exitSucceed(value2));
  }
});
const suspend = /* @__PURE__ */ makePrimitive({
  op: "Suspend",
  [evaluate](_fiber) {
    return this[args]();
  }
});
const yieldNowWith = /* @__PURE__ */ makePrimitive({
  op: "Yield",
  [evaluate](fiber) {
    let resumed = false;
    fiber.currentScheduler.scheduleTask(() => {
      if (resumed) return;
      fiber.evaluate(exitVoid);
    }, this[args] ?? 0);
    return fiber.yieldWith(() => {
      resumed = true;
    });
  }
});
const yieldNow = /* @__PURE__ */ yieldNowWith(0);
const die$1 = (defect) => exitDie(defect);
const failSync = (error) => suspend(() => fail$1(internalCall(error)));
const void_$1 = /* @__PURE__ */ succeed$2(void 0);
const tryPromise$1 = (options) => {
  const f = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.tryPromise") : options.catch;
  return callbackOptions(function(resume, signal) {
    try {
      internalCall(() => f(signal)).then((a) => resume(succeed$2(a)), (e) => resume(fail$1(internalCall(() => catcher(e)))));
    } catch (err) {
      resume(fail$1(internalCall(() => catcher(err))));
    }
  }, eval.length !== 0);
};
const callbackOptions = /* @__PURE__ */ makePrimitive({
  op: "Async",
  single: false,
  [evaluate](fiber) {
    const register = internalCall(() => this[args][0].bind(fiber.currentScheduler));
    let resumed = false;
    let yielded = false;
    const controller = this[args][1] ? new AbortController() : void 0;
    const onCancel = register((effect2) => {
      if (resumed) return;
      resumed = true;
      if (yielded) {
        fiber.evaluate(effect2);
      } else {
        yielded = effect2;
      }
    }, controller?.signal);
    if (yielded !== false) return yielded;
    yielded = true;
    keepAlive.increment();
    fiber._yielded = () => {
      resumed = true;
      keepAlive.decrement();
    };
    if (controller === void 0 && onCancel === void 0) {
      return Yield;
    }
    fiber._stack.push(asyncFinalizer(() => {
      resumed = true;
      controller?.abort();
      return onCancel ?? exitVoid;
    }));
    return Yield;
  }
});
const asyncFinalizer = /* @__PURE__ */ makePrimitive({
  op: "AsyncFinalizer",
  [contAll](fiber) {
    if (fiber.interruptible) {
      fiber.interruptible = false;
      fiber._stack.push(setInterruptibleTrue);
    }
  },
  [contE](cause, _fiber) {
    return hasInterrupts(cause) ? flatMap$1(this[args](), () => failCause(cause)) : failCause(cause);
  }
});
const callback = (register) => callbackOptions(register, register.length >= 2);
const gen$1 = (...args2) => suspend(() => fromIteratorUnsafe(args2.length === 1 ? args2[0]() : args2[1].call(args2[0].self)));
const fnUntraced = (body, ...pipeables) => {
  return pipeables.length === 0 ? function() {
    return suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
  } : function() {
    let effect2 = suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
    for (let i = 0; i < pipeables.length; i++) {
      effect2 = pipeables[i](effect2, ...arguments);
    }
    return effect2;
  };
};
const fromIteratorUnsafe = /* @__PURE__ */ makePrimitive({
  op: "Iterator",
  single: false,
  [contA](value2, fiber) {
    const iter = this[args][0];
    while (true) {
      const state = iter.next(value2);
      if (state.done) return succeed$2(state.value);
      const eff = state.value.asEffect();
      if (!effectIsExit(eff)) {
        fiber._stack.push(this);
        return eff;
      } else if (eff._tag === "Failure") {
        return eff;
      }
      value2 = eff.value;
    }
  },
  [evaluate](fiber) {
    return this[contA](this[args][1], fiber);
  }
});
const as = /* @__PURE__ */ dual(2, (self, value2) => {
  const b = succeed$2(value2);
  return flatMap$1(self, (_) => b);
});
const andThen = /* @__PURE__ */ dual(2, (self, f) => flatMap$1(self, (a) => isEffect(f) ? f : internalCall(() => f(a))));
const asVoid = (self) => flatMap$1(self, (_) => exitVoid);
const flatMap$1 = /* @__PURE__ */ dual(2, (self, f) => {
  const onSuccess = Object.create(OnSuccessProto);
  onSuccess[args] = self;
  onSuccess[contA] = f.length !== 1 ? (a) => f(a) : f;
  return onSuccess;
});
const OnSuccessProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccess",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
const effectIsExit = (effect2) => ExitTypeId in effect2;
const map$1 = /* @__PURE__ */ dual(2, (self, f) => flatMap$1(self, (a) => succeed$2(internalCall(() => f(a)))));
const exitIsSuccess = (self) => self._tag === "Success";
const exitVoid = /* @__PURE__ */ exitSucceed(void 0);
const exitAsVoidAll = (exits) => {
  const failures = [];
  for (const exit2 of exits) {
    if (exit2._tag === "Failure") {
      failures.push(...exit2.cause.reasons);
    }
  }
  return failures.length === 0 ? exitVoid : exitFailCause(causeFromReasons(failures));
};
const updateServices = /* @__PURE__ */ dual(2, (self, f) => withFiber((fiber) => {
  const prev = fiber.services;
  const nextServices = f(prev);
  if (prev === nextServices) return self;
  fiber.setServices(nextServices);
  const newServices = /* @__PURE__ */ new Map();
  for (const [key, value2] of fiber.services.mapUnsafe) {
    if (!prev.mapUnsafe.has(key) || value2 !== prev.mapUnsafe.get(key)) {
      newServices.set(key, value2);
    }
  }
  return onExitPrimitive(self, () => {
    const map2 = new Map(fiber.services.mapUnsafe);
    for (const [key, value2] of newServices) {
      if (value2 !== map2.get(key)) continue;
      if (prev.mapUnsafe.has(key)) {
        map2.set(key, prev.mapUnsafe.get(key));
      } else {
        map2.delete(key);
      }
    }
    fiber.setServices(makeUnsafe$2(map2));
    return void 0;
  });
}));
const provideServices = /* @__PURE__ */ dual(2, (self, services) => {
  if (effectIsExit(self)) return self;
  return updateServices(self, merge(services));
});
const provideService = function() {
  if (arguments.length === 1) {
    return dual(2, (self, impl) => provideServiceImpl(self, arguments[0], impl));
  }
  return dual(3, (self, service, impl) => provideServiceImpl(self, service, impl)).apply(this, arguments);
};
const provideServiceImpl = (self, service, implementation) => withFiber((fiber) => {
  const prev = getOption(fiber.services, service);
  if (prev._tag === "Some" && prev.value === implementation) return self;
  fiber.setServices(add(fiber.services, service, implementation));
  return onExit(self, () => sync$1(() => fiber.setServices(addOrOmit(fiber.services, service, prev))));
});
const catchCause = /* @__PURE__ */ dual(2, (self, f) => {
  const onFailure = Object.create(OnFailureProto);
  onFailure[args] = self;
  onFailure[contE] = f.length !== 1 ? (cause) => f(cause) : f;
  return onFailure;
});
const OnFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnFailure",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
const catchCauseIf = /* @__PURE__ */ dual(3, (self, filter, f) => catchCause(self, (cause) => {
  const eb = apply(filter, cause);
  return !isFailure(eb) ? internalCall(() => f(eb.success, cause)) : failCause(eb.failure);
}));
const catch_ = /* @__PURE__ */ dual(2, (self, f) => catchCauseIf(self, findError, (e) => f(e)));
const catchIf = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, filter, f, orElse2) => catchCause(self, (cause) => {
  const error = findError(cause);
  if (isFailure(error)) return failCause(error.failure);
  const result2 = apply(filter, error.success);
  if (isFailure(result2)) {
    return orElse2 ? internalCall(() => orElse2(result2.failure)) : failCause(cause);
  }
  return internalCall(() => f(result2.success));
}));
const catchTag$1 = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, k, f, orElse2) => {
  const pred = Array.isArray(k) ? (e) => hasProperty(e, "_tag") && k.includes(e._tag) : isTagged(k);
  return catchIf(self, pred, f, orElse2);
});
const mapError$1 = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (error) => failSync(() => f(error))));
const orDie$1 = (self) => catch_(self, die$1);
const result$1 = (self) => matchEager(self, {
  onFailure: fail$2,
  onSuccess: succeed$3
});
const matchCauseEffect = /* @__PURE__ */ dual(2, (self, options) => {
  const primitive = Object.create(OnSuccessAndFailureProto);
  primitive[args] = self;
  primitive[contA] = options.onSuccess.length !== 1 ? (a) => options.onSuccess(a) : options.onSuccess;
  primitive[contE] = options.onFailure.length !== 1 ? (cause) => options.onFailure(cause) : options.onFailure;
  return primitive;
});
const OnSuccessAndFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccessAndFailure",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
const matchEffect = /* @__PURE__ */ dual(2, (self, options) => matchCauseEffect(self, {
  onFailure: (cause) => {
    const fail2 = cause.reasons.find(isFailReason);
    return fail2 ? internalCall(() => options.onFailure(fail2.error)) : failCause(cause);
  },
  onSuccess: options.onSuccess
}));
const match = /* @__PURE__ */ dual(2, (self, options) => matchEffect(self, {
  onFailure: (error) => sync$1(() => options.onFailure(error)),
  onSuccess: (value2) => sync$1(() => options.onSuccess(value2))
}));
const matchEager = /* @__PURE__ */ dual(2, (self, options) => {
  if (effectIsExit(self)) {
    if (self._tag === "Success") return exitSucceed(options.onSuccess(self.value));
    const error = findError(self.cause);
    if (isFailure(error)) return self;
    return exitSucceed(options.onFailure(error.success));
  }
  return match(self, options);
});
const exit$1 = (self) => effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self);
const exitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "Exit",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  },
  [contA](value2, _, exit2) {
    return succeed$2(exit2 ?? exitSucceed(value2));
  },
  [contE](cause, _, exit2) {
    return succeed$2(exit2 ?? exitFailCause(cause));
  }
});
const ScopeTypeId = "~effect/Scope";
const ScopeCloseableTypeId = "~effect/Scope/Closeable";
const scopeTag = /* @__PURE__ */ Service("effect/Scope");
const scopeClose = (self, exit_) => suspend(() => scopeCloseUnsafe(self, exit_) ?? void_$1);
const scopeCloseUnsafe = (self, exit_) => {
  if (self.state._tag === "Closed") return;
  const closed = {
    _tag: "Closed",
    exit: exit_
  };
  if (self.state._tag === "Empty") {
    self.state = closed;
    return;
  }
  const {
    finalizers
  } = self.state;
  self.state = closed;
  if (finalizers.size === 0) {
    return;
  } else if (finalizers.size === 1) {
    return finalizers.values().next().value(exit_);
  }
  return scopeCloseFinalizers(self, finalizers, exit_);
};
const scopeCloseFinalizers = /* @__PURE__ */ fnUntraced(function* (self, finalizers, exit_) {
  let exits = [];
  const fibers = [];
  const arr = Array.from(finalizers.values());
  const parent = getCurrentFiber();
  for (let i = arr.length - 1; i >= 0; i--) {
    const finalizer = arr[i];
    if (self.strategy === "sequential") {
      exits.push(yield* exit$1(finalizer(exit_)));
    } else {
      fibers.push(forkUnsafe$1(parent, finalizer(exit_), true, true, "inherit"));
    }
  }
  if (fibers.length > 0) {
    exits = yield* fiberAwaitAll(fibers);
  }
  return yield* exitAsVoidAll(exits);
});
const scopeForkUnsafe = (scope, finalizerStrategy) => {
  const newScope = scopeMakeUnsafe(finalizerStrategy);
  if (scope.state._tag === "Closed") {
    newScope.state = scope.state;
    return newScope;
  }
  const key = {};
  scopeAddFinalizerUnsafe(scope, key, (exit2) => scopeClose(newScope, exit2));
  scopeAddFinalizerUnsafe(newScope, key, (_) => sync$1(() => scopeRemoveFinalizerUnsafe(scope, key)));
  return newScope;
};
const scopeAddFinalizerExit = (scope, finalizer) => {
  return suspend(() => {
    if (scope.state._tag === "Closed") {
      return finalizer(scope.state.exit);
    }
    scopeAddFinalizerUnsafe(scope, {}, finalizer);
    return void_$1;
  });
};
const scopeAddFinalizerUnsafe = (scope, key, finalizer) => {
  if (scope.state._tag === "Empty") {
    scope.state = {
      _tag: "Open",
      finalizers: /* @__PURE__ */ new Map([[key, finalizer]])
    };
  } else if (scope.state._tag === "Open") {
    scope.state.finalizers.set(key, finalizer);
  }
};
const scopeRemoveFinalizerUnsafe = (scope, key) => {
  if (scope.state._tag === "Open") {
    scope.state.finalizers.delete(key);
  }
};
const scopeMakeUnsafe = (finalizerStrategy = "sequential") => ({
  [ScopeCloseableTypeId]: ScopeCloseableTypeId,
  [ScopeTypeId]: ScopeTypeId,
  strategy: finalizerStrategy,
  state: constScopeEmpty
});
const constScopeEmpty = {
  _tag: "Empty"
};
const provideScope = /* @__PURE__ */ provideService(scopeTag);
const scopedWith = (f) => suspend(() => {
  const scope = scopeMakeUnsafe();
  return onExit(f(scope), (exit2) => suspend(() => scopeCloseUnsafe(scope, exit2) ?? void_$1));
});
const onExitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "OnExit",
  single: false,
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args][0];
  },
  [contAll](fiber) {
    if (fiber.interruptible && this[args][2] !== true) {
      fiber._stack.push(setInterruptibleTrue);
      fiber.interruptible = false;
    }
  },
  [contA](value2, _, exit2) {
    exit2 ??= exitSucceed(value2);
    const eff = this[args][1](exit2);
    return eff ? flatMap$1(eff, (_2) => exit2) : exit2;
  },
  [contE](cause, _, exit2) {
    exit2 ??= exitFailCause(cause);
    const eff = this[args][1](exit2);
    return eff ? flatMap$1(eff, (_2) => exit2) : exit2;
  }
});
const onExit = /* @__PURE__ */ dual(2, onExitPrimitive);
const setInterruptible = /* @__PURE__ */ makePrimitive({
  op: "SetInterruptible",
  [contAll](fiber) {
    fiber.interruptible = this[args];
    if (fiber._interruptedCause && fiber.interruptible) {
      return () => failCause(fiber._interruptedCause);
    }
  }
});
const setInterruptibleTrue = /* @__PURE__ */ setInterruptible(true);
const all$1 = (arg, options) => {
  if (isIterable(arg)) {
    return options?.mode === "result" ? forEach$1(arg, result$1, options) : forEach$1(arg, identity, options);
  } else if (options?.discard) {
    return options.mode === "result" ? forEach$1(Object.values(arg), result$1, options) : forEach$1(Object.values(arg), identity, options);
  }
  return suspend(() => {
    const out = {};
    return as(forEach$1(Object.entries(arg), ([key, effect2]) => map$1(options?.mode === "result" ? result$1(effect2) : effect2, (value2) => {
      out[key] = value2;
    }), {
      discard: true,
      concurrency: options?.concurrency
    }), out);
  });
};
const whileLoop = /* @__PURE__ */ makePrimitive({
  op: "While",
  [contA](value2, fiber) {
    this[args].step(value2);
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  },
  [evaluate](fiber) {
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  }
});
const forEach$1 = /* @__PURE__ */ dual((args2) => typeof args2[1] === "function", (iterable, f, options) => withFiber((parent) => {
  const concurrencyOption = options?.concurrency === "inherit" ? parent.getRef(CurrentConcurrency) : options?.concurrency ?? 1;
  const concurrency = concurrencyOption === "unbounded" ? Number.POSITIVE_INFINITY : Math.max(1, concurrencyOption);
  if (concurrency === 1) {
    return forEachSequential(iterable, f, options);
  }
  const items = fromIterable(iterable);
  let length = items.length;
  if (length === 0) {
    return options?.discard ? void_$1 : succeed$2([]);
  }
  const out = options?.discard ? void 0 : new Array(length);
  let index = 0;
  const annotations = fiberStackAnnotations(parent);
  return callback((resume) => {
    const fibers = /* @__PURE__ */ new Set();
    const failures = [];
    let failed = false;
    let inProgress = 0;
    let doneCount = 0;
    let pumping = false;
    let interrupted = false;
    function pump() {
      pumping = true;
      while (inProgress < concurrency && index < length) {
        const currentIndex = index;
        const item = items[currentIndex];
        index++;
        inProgress++;
        try {
          const child = forkUnsafe$1(parent, f(item, currentIndex), true, true, "inherit");
          fibers.add(child);
          child.addObserver((exit2) => {
            if (interrupted) {
              return;
            }
            fibers.delete(child);
            if (exit2._tag === "Failure") {
              if (!failed) {
                failed = true;
                length = index;
                failures.push(...exit2.cause.reasons);
                fibers.forEach((fiber) => fiber.interruptUnsafe(parent.id, annotations));
              } else {
                for (const f2 of exit2.cause.reasons) {
                  if (f2._tag === "Interrupt") continue;
                  failures.push(f2);
                }
              }
            } else if (out !== void 0) {
              out[currentIndex] = exit2.value;
            }
            doneCount++;
            inProgress--;
            if (doneCount === length) {
              resume(failures.length > 0 ? exitFailCause(causeFromReasons(failures)) : succeed$2(out));
            } else if (!pumping && !failed && inProgress < concurrency) {
              pump();
            }
          });
        } catch (err) {
          failed = true;
          length = index;
          failures.push(new Die(err));
          fibers.forEach((fiber) => fiber.interruptUnsafe(parent.id, annotations));
        }
      }
      pumping = false;
    }
    pump();
    return suspend(() => {
      interrupted = true;
      index = length;
      return fiberInterruptAll(fibers);
    });
  });
}));
const forEachSequential = (iterable, f, options) => suspend(() => {
  const out = options?.discard ? void 0 : [];
  const iterator = iterable[Symbol.iterator]();
  let state = iterator.next();
  let index = 0;
  return as(whileLoop({
    while: () => !state.done,
    body: () => f(state.value, index++),
    step: (b) => {
      if (out) out.push(b);
      state = iterator.next();
    }
  }), out);
});
const forkUnsafe$1 = (parent, effect2, immediate = false, daemon = false, uninterruptible = false) => {
  const interruptible = uninterruptible === "inherit" ? parent.interruptible : !uninterruptible;
  const child = new FiberImpl(parent.services, interruptible);
  if (immediate) {
    child.evaluate(effect2);
  } else {
    parent.currentScheduler.scheduleTask(() => child.evaluate(effect2), 0);
  }
  if (!daemon && !child._exit) {
    parent.children().add(child);
    child.addObserver(() => parent._children.delete(child));
  }
  return child;
};
const runForkWith = (services) => (effect2, options) => {
  const scheduler = options?.scheduler || !services.mapUnsafe.has(Scheduler.key) && new MixedScheduler();
  const fiber = new FiberImpl(scheduler ? add(services, Scheduler, scheduler) : services, options?.uninterruptible !== true);
  fiber.evaluate(effect2);
  if (fiber._exit) return fiber;
  if (options?.signal) {
    if (options.signal.aborted) {
      fiber.interruptUnsafe();
    } else {
      const abort = () => fiber.interruptUnsafe();
      options.signal.addEventListener("abort", abort, {
        once: true
      });
      fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
    }
  }
  return fiber;
};
const runPromiseExitWith = (services) => {
  const runFork = runForkWith(services);
  return (effect2, options) => {
    const fiber = runFork(effect2, options);
    return new Promise((resolve) => {
      fiber.addObserver((exit2) => resolve(exit2));
    });
  };
};
const runPromiseWith = (services) => {
  const runPromiseExit = runPromiseExitWith(services);
  return (effect2, options) => runPromiseExit(effect2, options).then((exit2) => {
    if (exit2._tag === "Failure") {
      throw causeSquash(exit2.cause);
    }
    return exit2.value;
  });
};
const runPromise$1 = /* @__PURE__ */ runPromiseWith(/* @__PURE__ */ empty());
const runSyncExitWith = (services) => {
  const runFork = runForkWith(services);
  return (effect2) => {
    if (effectIsExit(effect2)) return effect2;
    const scheduler = new MixedScheduler("sync");
    const fiber = runFork(effect2, {
      scheduler
    });
    scheduler.flush();
    return fiber._exit ?? exitDie(fiber);
  };
};
const runSyncWith = (services) => {
  const runSyncExit = runSyncExitWith(services);
  return (effect2) => {
    const exit2 = runSyncExit(effect2);
    if (exit2._tag === "Failure") throw causeSquash(exit2.cause);
    return exit2.value;
  };
};
const runSync$1 = /* @__PURE__ */ runSyncWith(/* @__PURE__ */ empty());
const ClockRef = /* @__PURE__ */ Reference("effect/Clock", {
  defaultValue: () => new ClockImpl()
});
const MAX_TIMER_MILLIS = 2 ** 31 - 1;
class ClockImpl {
  currentTimeMillisUnsafe() {
    return Date.now();
  }
  currentTimeMillis = /* @__PURE__ */ sync$1(() => this.currentTimeMillisUnsafe());
  currentTimeNanosUnsafe() {
    return processOrPerformanceNow();
  }
  currentTimeNanos = /* @__PURE__ */ sync$1(() => this.currentTimeNanosUnsafe());
  sleep(duration) {
    const millis = toMillis(duration);
    if (millis <= 0) return yieldNow;
    return callback((resume) => {
      if (millis > MAX_TIMER_MILLIS) return;
      const handle = setTimeout(() => resume(void_$1), millis);
      return sync$1(() => clearTimeout(handle));
    });
  }
}
const performanceNowNanos = /* @__PURE__ */ (function() {
  const bigint1e6 = /* @__PURE__ */ BigInt(1e6);
  if (typeof performance === "undefined" || typeof performance.now === "undefined") {
    return () => BigInt(Date.now()) * bigint1e6;
  } else if (typeof performance.timeOrigin === "number" && performance.timeOrigin === 0) {
    return () => BigInt(Math.round(performance.now() * 1e6));
  }
  const origin = /* @__PURE__ */ BigInt(/* @__PURE__ */ Date.now()) * bigint1e6 - /* @__PURE__ */ BigInt(/* @__PURE__ */ Math.round(/* @__PURE__ */ performance.now() * 1e6));
  return () => origin + BigInt(Math.round(performance.now() * 1e6));
})();
const processOrPerformanceNow = /* @__PURE__ */ (function() {
  const processHrtime = typeof process === "object" && "hrtime" in process && typeof process.hrtime.bigint === "function" ? process.hrtime : void 0;
  if (!processHrtime) {
    return performanceNowNanos;
  }
  const origin = /* @__PURE__ */ performanceNowNanos() - /* @__PURE__ */ processHrtime.bigint();
  return () => origin + processHrtime.bigint();
})();
const UnknownErrorTypeId = "~effect/Cause/UnknownError";
class UnknownError extends (/* @__PURE__ */ TaggedError$1("UnknownError")) {
  [UnknownErrorTypeId] = UnknownErrorTypeId;
  constructor(cause, message) {
    super({
      message,
      cause
    });
  }
}
const ConsoleRef = /* @__PURE__ */ Reference("effect/Console/CurrentConsole", {
  defaultValue: () => globalThis.console
});
const logLevelToOrder = (level) => {
  switch (level) {
    case "All":
      return Number.MIN_SAFE_INTEGER;
    case "Fatal":
      return 5e4;
    case "Error":
      return 4e4;
    case "Warn":
      return 3e4;
    case "Info":
      return 2e4;
    case "Debug":
      return 1e4;
    case "Trace":
      return 0;
    case "None":
      return Number.MAX_SAFE_INTEGER;
  }
};
const LogLevelOrder = /* @__PURE__ */ mapInput(Number$1, logLevelToOrder);
const isLogLevelGreaterThan = /* @__PURE__ */ isGreaterThan(LogLevelOrder);
const CurrentLoggers = /* @__PURE__ */ Reference("effect/Loggers/CurrentLoggers", {
  defaultValue: () => /* @__PURE__ */ new Set([defaultLogger, tracerLogger])
});
const LogToStderr = /* @__PURE__ */ Reference("effect/Logger/LogToStderr", {
  defaultValue: constFalse
});
const LoggerTypeId = "~effect/Logger";
const LoggerProto = {
  [LoggerTypeId]: {
    _Message: identity,
    _Output: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
const loggerMake = (log) => {
  const self = Object.create(LoggerProto);
  self.log = log;
  return self;
};
const formatLabel = (key) => key.replace(/[\s="]/g, "_");
const formatLogSpan = (self, now) => {
  const label = formatLabel(self[0]);
  return `${label}=${now - self[1]}ms`;
};
const logWithLevel = (level) => (...message) => {
  let cause = void 0;
  for (let i = 0, len = message.length; i < len; i++) {
    const msg = message[i];
    if (isCause(msg)) {
      if (cause) {
        message.splice(i, 1);
      } else {
        message = message.slice(0, i).concat(message.slice(i + 1));
      }
      cause = cause ? causeFromReasons(cause.reasons.concat(msg.reasons)) : msg;
      i--;
    }
  }
  if (cause === void 0) {
    cause = causeEmpty;
  }
  return withFiber((fiber) => {
    const logLevel = level ?? fiber.currentLogLevel;
    if (isLogLevelGreaterThan(fiber.minimumLogLevel, logLevel)) {
      return void_$1;
    }
    const clock = fiber.getRef(ClockRef);
    const loggers = fiber.getRef(CurrentLoggers);
    if (loggers.size > 0) {
      const date = new Date(clock.currentTimeMillisUnsafe());
      for (const logger of loggers) {
        logger.log({
          cause,
          fiber,
          date,
          logLevel,
          message
        });
      }
    }
    return void_$1;
  });
};
const defaultDateFormat = (date) => `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
const hasProcessStdout = typeof process === "object" && process !== null && typeof process.stdout === "object" && process.stdout !== null;
hasProcessStdout && process.stdout.isTTY === true;
const defaultLogger = /* @__PURE__ */ loggerMake(({
  cause,
  date,
  fiber,
  logLevel,
  message
}) => {
  const message_ = Array.isArray(message) ? message.slice() : [message];
  if (cause.reasons.length > 0) {
    message_.unshift(causePretty(cause));
  }
  const now = date.getTime();
  const spans = fiber.getRef(CurrentLogSpans);
  let spanString = "";
  for (const span of spans) {
    spanString += ` ${formatLogSpan(span, now)}`;
  }
  const annotations = fiber.getRef(CurrentLogAnnotations);
  if (Object.keys(annotations).length > 0) {
    message_.push(annotations);
  }
  const console = fiber.getRef(ConsoleRef);
  const log = fiber.getRef(LogToStderr) ? console.error : console.log;
  log(`[${defaultDateFormat(date)}] ${logLevel.toUpperCase()} (#${fiber.id})${spanString}:`, ...message_);
});
const tracerLogger = /* @__PURE__ */ loggerMake(({
  cause,
  fiber,
  logLevel,
  message
}) => {
  const clock = fiber.getRef(ClockRef);
  const annotations = fiber.getRef(CurrentLogAnnotations);
  const span = fiber.currentSpan;
  if (span === void 0 || span._tag === "ExternalSpan") return;
  const attributes = {};
  for (const [key, value2] of Object.entries(annotations)) {
    attributes[key] = value2;
  }
  attributes["effect.fiberId"] = fiber.id;
  attributes["effect.logLevel"] = logLevel.toUpperCase();
  if (cause.reasons.length > 0) {
    attributes["effect.cause"] = causePretty(cause);
  }
  span.event(toStringUnknown(Array.isArray(message) && message.length === 1 ? message[0] : message), clock.currentTimeNanosUnsafe(), attributes);
});
const isSuccess = exitIsSuccess;
const TypeId$2 = "~effect/Deferred";
const DeferredProto = {
  [TypeId$2]: {
    _A: identity,
    _E: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
const makeUnsafe$1 = () => {
  const self = Object.create(DeferredProto);
  self.resumes = void 0;
  self.effect = void 0;
  return self;
};
const _await = (self) => callback((resume) => {
  if (self.effect) return resume(self.effect);
  self.resumes ??= [];
  self.resumes.push(resume);
  return sync$1(() => {
    const index = self.resumes.indexOf(resume);
    self.resumes.splice(index, 1);
  });
});
const completeWith = /* @__PURE__ */ dual(2, (self, effect2) => sync$1(() => doneUnsafe(self, effect2)));
const done = completeWith;
const doneUnsafe = (self, effect2) => {
  if (self.effect) return false;
  self.effect = effect2;
  if (self.resumes) {
    for (let i = 0; i < self.resumes.length; i++) {
      self.resumes[i](effect2);
    }
    self.resumes = void 0;
  }
  return true;
};
const makeUnsafe = scopeMakeUnsafe;
const provide$2 = provideScope;
const forkUnsafe = scopeForkUnsafe;
const close = scopeClose;
const TypeId$1 = "~effect/Layer";
const MemoMapTypeId = "~effect/Layer/MemoMap";
const LayerProto = {
  [TypeId$1]: {
    _ROut: identity,
    _E: identity,
    _RIn: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
const fromBuildUnsafe = (build) => {
  const self = Object.create(LayerProto);
  self.build = build;
  return self;
};
const fromBuild = (build) => fromBuildUnsafe((memoMap, scope) => {
  const layerScope = forkUnsafe(scope);
  return onExit(build(memoMap, layerScope), (exit2) => exit2._tag === "Failure" ? close(layerScope, exit2) : void_$1);
});
const fromBuildMemo = (build) => {
  const self = fromBuild((memoMap, scope) => memoMap.getOrElseMemoize(self, scope, build));
  return self;
};
class MemoMapImpl {
  get [MemoMapTypeId]() {
    return MemoMapTypeId;
  }
  map = /* @__PURE__ */ new Map();
  getOrElseMemoize(layer, scope, build) {
    if (this.map.has(layer)) {
      const entry2 = this.map.get(layer);
      entry2.observers++;
      return andThen(scopeAddFinalizerExit(scope, (exit2) => entry2.finalizer(exit2)), entry2.effect);
    }
    const layerScope = makeUnsafe();
    const deferred = makeUnsafe$1();
    const entry = {
      observers: 1,
      effect: _await(deferred),
      finalizer: (exit2) => suspend(() => {
        entry.observers--;
        if (entry.observers === 0) {
          this.map.delete(layer);
          return close(layerScope, exit2);
        }
        return void_$1;
      })
    };
    this.map.set(layer, entry);
    return scopeAddFinalizerExit(scope, entry.finalizer).pipe(flatMap$1(() => build(this, layerScope)), onExit((exit2) => {
      entry.effect = exit2;
      return done(deferred, exit2);
    }));
  }
}
const makeMemoMapUnsafe = () => new MemoMapImpl();
class CurrentMemoMap extends (/* @__PURE__ */ Service()("effect/Layer/CurrentMemoMap")) {
  static getOrCreate = /* @__PURE__ */ getOrElse(this, makeMemoMapUnsafe);
}
const buildWithMemoMap = /* @__PURE__ */ dual(3, (self, memoMap, scope) => provideService(map$1(self.build(memoMap, scope), add(CurrentMemoMap, memoMap)), CurrentMemoMap, memoMap));
const buildWithScope = /* @__PURE__ */ dual(2, (self, scope) => withFiber((fiber) => buildWithMemoMap(self, CurrentMemoMap.getOrCreate(fiber.services), scope)));
const succeed$1 = function() {
  if (arguments.length === 1) {
    return (resource) => succeedServices(make(arguments[0], resource));
  }
  return succeedServices(make(arguments[0], arguments[1]));
};
const succeedServices = (services) => fromBuildUnsafe(constant(succeed$2(services)));
const effect = function() {
  if (arguments.length === 1) {
    return (effect2) => effectImpl(arguments[0], effect2);
  }
  return effectImpl(arguments[0], arguments[1]);
};
const effectImpl = (service, effect2) => effectServices(map$1(effect2, (value2) => make(service, value2)));
const effectServices = (effect2) => fromBuildMemo((_, scope) => provide$2(effect2, scope));
const mergeAllEffect = (layers, memoMap, scope) => {
  const parentScope = forkUnsafe(scope, "parallel");
  return forEach$1(layers, (layer) => layer.build(memoMap, forkUnsafe(parentScope, "sequential")), {
    concurrency: layers.length
  }).pipe(map$1((services) => mergeAll$1(...services)));
};
const mergeAll = (...layers) => fromBuild((memoMap, scope) => mergeAllEffect(layers, memoMap, scope));
const provideWith = (self, that, f) => fromBuild((memoMap, scope) => flatMap$1(Array.isArray(that) ? mergeAllEffect(that, memoMap, scope) : that.build(memoMap, scope), (context) => self.build(memoMap, scope).pipe(provideServices(context), map$1((merged) => f(merged, context)))));
const provideMerge = /* @__PURE__ */ dual(2, (self, that) => provideWith(self, that, (self2, that2) => merge(that2, self2)));
const TaggedError = TaggedError$1;
const provideLayer = (self, layer, options) => scopedWith((scope) => flatMap$1(options?.local ? buildWithMemoMap(layer, makeMemoMapUnsafe(), scope) : buildWithScope(layer, scope), (context) => provideServices(self, context)));
const provide$1 = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, source, options) => isServiceMap(source) ? provideServices(self, source) : provideLayer(self, Array.isArray(source) ? mergeAll(...source) : source, options));
const all = all$1;
const forEach = forEach$1;
const tryPromise = tryPromise$1;
const succeed = succeed$2;
const sync = sync$1;
const void_ = void_$1;
const gen = gen$1;
const fail = fail$1;
const die = die$1;
const flatMap = flatMap$1;
const exit = exit$1;
const map = map$1;
const catchTag = catchTag$1;
const mapError = mapError$1;
const orDie = orDie$1;
const provide = provide$1;
const runPromise = runPromise$1;
const runSync = runSync$1;
const logWarning = /* @__PURE__ */ logWithLevel("Warn");
const logError = /* @__PURE__ */ logWithLevel("Error");
const logInfo = /* @__PURE__ */ logWithLevel("Info");
const TypeId = "~effect/match/Match/Matcher";
const ValueMatcherProto = {
  [TypeId]: {
    _input: identity,
    _filters: identity,
    _result: identity,
    _return: identity
  },
  _tag: "ValueMatcher",
  add(_case) {
    if (isSuccess$1(this.value)) {
      return this;
    }
    if (_case._tag === "When" && _case.guard(this.provided) === true) {
      return makeValueMatcher(this.provided, succeed$3(_case.evaluate(this.provided)));
    } else if (_case._tag === "Not" && _case.guard(this.provided) === false) {
      return makeValueMatcher(this.provided, succeed$3(_case.evaluate(this.provided)));
    }
    return this;
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
function makeValueMatcher(provided, value2) {
  const matcher = Object.create(ValueMatcherProto);
  matcher.provided = provided;
  matcher.value = value2;
  return matcher;
}
const makeWhen = (guard, evaluate2) => ({
  _tag: "When",
  guard,
  evaluate: evaluate2
});
const makePredicate = (pattern) => {
  if (typeof pattern === "function") {
    return pattern;
  } else if (Array.isArray(pattern)) {
    const predicates = pattern.map(makePredicate);
    const len = predicates.length;
    return (u) => {
      if (!Array.isArray(u)) {
        return false;
      }
      for (let i = 0; i < len; i++) {
        if (predicates[i](u[i]) === false) {
          return false;
        }
      }
      return true;
    };
  } else if (pattern !== null && typeof pattern === "object") {
    const keysAndPredicates = Object.entries(pattern).map(([k, p]) => [k, makePredicate(p)]);
    const len = keysAndPredicates.length;
    return (u) => {
      if (typeof u !== "object" || u === null) {
        return false;
      }
      for (let i = 0; i < len; i++) {
        const [key, predicate] = keysAndPredicates[i];
        if (!(key in u) || predicate(u[key]) === false) {
          return false;
        }
      }
      return true;
    };
  }
  return (u) => u === pattern;
};
const value$1 = (i) => makeValueMatcher(i, fail$2(i));
const when$1 = (pattern, f) => (self) => self.add(makeWhen(makePredicate(pattern), f));
const orElse$1 = (f) => (self) => {
  const toResult = result(self);
  if (isResult(toResult)) {
    return toResult._tag === "Success" ? toResult.success : f(toResult.failure);
  }
  return (input) => {
    const a = toResult(input);
    return isSuccess$1(a) ? a.success : f(a.failure);
  };
};
const result = (self) => {
  if (self._tag === "ValueMatcher") {
    return self.value;
  }
  const len = self.cases.length;
  if (len === 1) {
    const _case = self.cases[0];
    return (input) => {
      if (_case._tag === "When" && _case.guard(input) === true) {
        return succeed$3(_case.evaluate(input));
      } else if (_case._tag === "Not" && _case.guard(input) === false) {
        return succeed$3(_case.evaluate(input));
      }
      return fail$2(input);
    };
  }
  return (input) => {
    for (let i = 0; i < len; i++) {
      const _case = self.cases[i];
      if (_case._tag === "When" && _case.guard(input) === true) {
        return succeed$3(_case.evaluate(input));
      } else if (_case._tag === "Not" && _case.guard(input) === false) {
        return succeed$3(_case.evaluate(input));
      }
    }
    return fail$2(input);
  };
};
const value = value$1;
const when = when$1;
const orElse = orElse$1;
export {
  when as A,
  orElse as B,
  sync as C,
  Service as S,
  TaggedError as T,
  all as a,
  map as b,
  catchTag as c,
  fail as d,
  provideMerge as e,
  forEach as f,
  gen as g,
  succeed$1 as h,
  runSync as i,
  logWarning as j,
  logInfo as k,
  logError as l,
  mergeAll as m,
  effect as n,
  mapError as o,
  provide as p,
  exit as q,
  runPromise as r,
  succeed as s,
  tryPromise as t,
  isSuccess as u,
  die as v,
  flatMap as w,
  void_ as x,
  orDie as y,
  value as z
};
