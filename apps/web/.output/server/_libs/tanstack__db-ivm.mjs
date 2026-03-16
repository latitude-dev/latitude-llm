import { g as generateKeyBetween } from "./fractional-indexing.mjs";
class DefaultMap extends Map {
  constructor(defaultValue, entries) {
    super(entries);
    this.defaultValue = defaultValue;
  }
  get(key) {
    if (!this.has(key)) {
      return this.defaultValue();
    }
    return super.get(key);
  }
  /**
   * Update the value for a key using a function.
   */
  update(key, updater) {
    const value = this.get(key);
    const newValue = updater(value);
    this.set(key, newValue);
    return newValue;
  }
}
const chunkSize = 3e4;
function chunkedArrayPush(array, other) {
  if (other.length <= chunkSize) {
    array.push(...other);
  } else {
    for (let i = 0; i < other.length; i += chunkSize) {
      const chunk = other.slice(i, i + chunkSize);
      array.push(...chunk);
    }
  }
}
function binarySearch(array, value, comparator) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const comparison = comparator(array[mid], value);
    if (comparison < 0) {
      low = mid + 1;
    } else if (comparison > 0) {
      high = mid;
    } else {
      return mid;
    }
  }
  return low;
}
class ObjectIdGenerator {
  constructor() {
    this.objectIds = /* @__PURE__ */ new WeakMap();
    this.nextId = 0;
  }
  /**
   * Get a unique identifier for any value.
   * - Objects: Uses WeakMap for reference-based identity
   * - Primitives: Uses consistent string-based hashing
   */
  getId(value) {
    if (typeof value !== `object` || value === null) {
      const str = String(value);
      let hashValue = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hashValue = (hashValue << 5) - hashValue + char;
        hashValue = hashValue & hashValue;
      }
      return hashValue;
    }
    if (!this.objectIds.has(value)) {
      this.objectIds.set(value, this.nextId++);
    }
    return this.objectIds.get(value);
  }
  /**
   * Get a string representation of the ID for use in composite keys.
   */
  getStringId(value) {
    if (value === null) return `null`;
    if (value === void 0) return `undefined`;
    if (typeof value !== `object`) return `str_${String(value)}`;
    return `obj_${this.getId(value)}`;
  }
}
const globalObjectIdGenerator = new ObjectIdGenerator();
function diffHalfOpen(a, b) {
  const [a1, a2] = a;
  const [b1, b2] = b;
  const onlyInA = [
    ...range(a1, Math.min(a2, b1)),
    // left side of A outside B
    ...range(Math.max(a1, b2), a2)
    // right side of A outside B
  ];
  const onlyInB = [
    ...range(b1, Math.min(b2, a1)),
    ...range(Math.max(b1, a2), b2)
  ];
  return { onlyInA, onlyInB };
}
function range(start, end) {
  const out = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}
function compareKeys(a, b) {
  if (typeof a === typeof b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  return typeof a === `string` ? -1 : 1;
}
function serializeValue(value) {
  return JSON.stringify(value, (_, val) => {
    if (typeof val === "bigint") {
      return val.toString();
    }
    if (val instanceof Date) {
      return val.toISOString();
    }
    return val;
  });
}
const RANDOM_SEED = randomHash();
const STRING_MARKER = randomHash();
const BIG_INT_MARKER = randomHash();
const NEG_BIG_INT_MARKER = randomHash();
const SYMBOL_MARKER = randomHash();
function randomHash() {
  return Math.random() * (2 ** 31 - 1) >>> 0;
}
const buf = new ArrayBuffer(8);
const dv = new DataView(buf);
const u8 = new Uint8Array(buf);
class MurmurHashStream {
  constructor() {
    this.hash = RANDOM_SEED;
    this.length = 0;
    this.carry = 0;
    this.carryBytes = 0;
  }
  _mix(k1) {
    k1 = Math.imul(k1, 3432918353);
    k1 = k1 << 15 | k1 >>> 17;
    k1 = Math.imul(k1, 461845907);
    this.hash ^= k1;
    this.hash = this.hash << 13 | this.hash >>> 19;
    this.hash = Math.imul(this.hash, 5) + 3864292196;
  }
  writeByte(byte) {
    this.carry |= (byte & 255) << 8 * this.carryBytes;
    this.carryBytes++;
    this.length++;
    if (this.carryBytes === 4) {
      this._mix(this.carry >>> 0);
      this.carry = 0;
      this.carryBytes = 0;
    }
  }
  update(chunk) {
    switch (typeof chunk) {
      case `symbol`: {
        this.update(SYMBOL_MARKER);
        const description = chunk.description;
        if (!description) {
          return;
        }
        for (let i = 0; i < description.length; i++) {
          const code = description.charCodeAt(i);
          this.writeByte(code & 255);
          this.writeByte(code >>> 8 & 255);
        }
        return;
      }
      case `string`:
        this.update(STRING_MARKER);
        for (let i = 0; i < chunk.length; i++) {
          const code = chunk.charCodeAt(i);
          this.writeByte(code & 255);
          this.writeByte(code >>> 8 & 255);
        }
        return;
      case `number`:
        dv.setFloat64(0, chunk, true);
        this.writeByte(u8[0]);
        this.writeByte(u8[1]);
        this.writeByte(u8[2]);
        this.writeByte(u8[3]);
        this.writeByte(u8[4]);
        this.writeByte(u8[5]);
        this.writeByte(u8[6]);
        this.writeByte(u8[7]);
        return;
      case `bigint`: {
        let value = chunk;
        if (value < 0n) {
          value = -value;
          this.update(NEG_BIG_INT_MARKER);
        } else {
          this.update(BIG_INT_MARKER);
        }
        while (value > 0n) {
          this.writeByte(Number(value & 0xffn));
          value >>= 8n;
        }
        if (chunk === 0n) this.writeByte(0);
        return;
      }
      default:
        throw new TypeError(`Unsupported input type: ${typeof chunk}`);
    }
  }
  digest() {
    if (this.carryBytes > 0) {
      let k1 = this.carry >>> 0;
      k1 = Math.imul(k1, 3432918353);
      k1 = k1 << 15 | k1 >>> 17;
      k1 = Math.imul(k1, 461845907);
      this.hash ^= k1;
    }
    this.hash ^= this.length;
    this.hash ^= this.hash >>> 16;
    this.hash = Math.imul(this.hash, 2246822507);
    this.hash ^= this.hash >>> 13;
    this.hash = Math.imul(this.hash, 3266489909);
    this.hash ^= this.hash >>> 16;
    return this.hash >>> 0;
  }
}
const TRUE = randomHash();
const FALSE = randomHash();
const NULL = randomHash();
const UNDEFINED = randomHash();
const KEY = randomHash();
const FUNCTIONS = randomHash();
const DATE_MARKER = randomHash();
const OBJECT_MARKER = randomHash();
const ARRAY_MARKER = randomHash();
const MAP_MARKER = randomHash();
const SET_MARKER = randomHash();
const UINT8ARRAY_MARKER = randomHash();
const UINT8ARRAY_CONTENT_HASH_THRESHOLD = 128;
const hashCache = /* @__PURE__ */ new WeakMap();
function hash(input) {
  const hasher = new MurmurHashStream();
  updateHasher(hasher, input);
  return hasher.digest();
}
function hashObject(input) {
  const cachedHash = hashCache.get(input);
  if (cachedHash !== void 0) {
    return cachedHash;
  }
  let valueHash;
  if (input instanceof Date) {
    valueHash = hashDate(input);
  } else if (
    // Check if input is a Uint8Array or Buffer
    typeof Buffer !== `undefined` && input instanceof Buffer || input instanceof Uint8Array
  ) {
    if (input.byteLength <= UINT8ARRAY_CONTENT_HASH_THRESHOLD) {
      valueHash = hashUint8Array(input);
    } else {
      return cachedReferenceHash(input);
    }
  } else if (input instanceof File) {
    return cachedReferenceHash(input);
  } else {
    let plainObjectInput = input;
    let marker = OBJECT_MARKER;
    if (input instanceof Array) {
      marker = ARRAY_MARKER;
    }
    if (input instanceof Map) {
      marker = MAP_MARKER;
      plainObjectInput = [...input.entries()];
    }
    if (input instanceof Set) {
      marker = SET_MARKER;
      plainObjectInput = [...input.entries()];
    }
    valueHash = hashPlainObject(plainObjectInput, marker);
  }
  hashCache.set(input, valueHash);
  return valueHash;
}
function hashDate(input) {
  const hasher = new MurmurHashStream();
  hasher.update(DATE_MARKER);
  hasher.update(input.getTime());
  return hasher.digest();
}
function hashUint8Array(input) {
  const hasher = new MurmurHashStream();
  hasher.update(UINT8ARRAY_MARKER);
  hasher.update(input.byteLength);
  for (let i = 0; i < input.byteLength; i++) {
    hasher.writeByte(input[i]);
  }
  return hasher.digest();
}
function hashPlainObject(input, marker) {
  const hasher = new MurmurHashStream();
  hasher.update(marker);
  const keys = Object.keys(input);
  keys.sort(keySort);
  for (const key of keys) {
    hasher.update(KEY);
    hasher.update(key);
    updateHasher(hasher, input[key]);
  }
  return hasher.digest();
}
function updateHasher(hasher, input) {
  if (input === null) {
    hasher.update(NULL);
    return;
  }
  switch (typeof input) {
    case `undefined`:
      hasher.update(UNDEFINED);
      return;
    case `boolean`:
      hasher.update(input ? TRUE : FALSE);
      return;
    case `number`:
      hasher.update(isNaN(input) ? NaN : input === 0 ? 0 : input);
      return;
    case `bigint`:
    case `string`:
    case `symbol`:
      hasher.update(input);
      return;
    case `object`:
      hasher.update(getCachedHash(input));
      return;
    case `function`:
      hasher.update(cachedReferenceHash(input));
      return;
    default:
      console.warn(
        `Ignored input during hashing because it is of type ${typeof input} which is not supported`
      );
  }
}
function getCachedHash(input) {
  let valueHash = hashCache.get(input);
  if (valueHash === void 0) {
    valueHash = hashObject(input);
  }
  return valueHash;
}
let nextRefId = 1;
function cachedReferenceHash(fn) {
  let valueHash = hashCache.get(fn);
  if (valueHash === void 0) {
    valueHash = nextRefId ^ FUNCTIONS;
    nextRefId++;
    hashCache.set(fn, valueHash);
  }
  return valueHash;
}
function keySort(a, b) {
  return a.localeCompare(b);
}
class MultiSet {
  #inner;
  constructor(data = []) {
    this.#inner = data;
  }
  toString(indent = false) {
    return `MultiSet(${JSON.stringify(this.#inner, null, indent ? 2 : void 0)})`;
  }
  toJSON() {
    return JSON.stringify(Array.from(this.getInner()));
  }
  static fromJSON(json) {
    return new MultiSet(JSON.parse(json));
  }
  /**
   * Apply a function to all records in the collection.
   */
  map(f) {
    return new MultiSet(
      this.#inner.map(([data, multiplicity]) => [f(data), multiplicity])
    );
  }
  /**
   * Filter out records for which a function f(record) evaluates to False.
   */
  filter(f) {
    return new MultiSet(this.#inner.filter(([data, _]) => f(data)));
  }
  /**
   * Negate all multiplicities in the collection.
   */
  negate() {
    return new MultiSet(
      this.#inner.map(([data, multiplicity]) => [data, -multiplicity])
    );
  }
  /**
   * Concatenate two collections together.
   */
  concat(other) {
    const out = [];
    chunkedArrayPush(out, this.#inner);
    chunkedArrayPush(out, other.getInner());
    return new MultiSet(out);
  }
  /**
   * Produce as output a collection that is logically equivalent to the input
   * but which combines identical instances of the same record into one
   * (record, multiplicity) pair.
   */
  consolidate() {
    if (this.#inner.length > 0) {
      const firstItem = this.#inner[0]?.[0];
      if (Array.isArray(firstItem) && firstItem.length === 2) {
        return this.#consolidateKeyed();
      }
    }
    return this.#consolidateUnkeyed();
  }
  /**
   * Private method for consolidating keyed multisets where keys are strings/numbers
   * and values are compared by reference equality.
   *
   * This method provides significant performance improvements over the hash-based approach
   * by using WeakMap for object reference tracking and avoiding expensive serialization.
   *
   * Special handling for join operations: When values are tuples of length 2 (common in joins),
   * we unpack them and compare each element individually to maintain proper equality semantics.
   */
  #consolidateKeyed() {
    const consolidated = /* @__PURE__ */ new Map();
    const values = /* @__PURE__ */ new Map();
    const getTupleId = (tuple) => {
      if (tuple.length !== 2) {
        throw new Error(`Expected tuple of length 2`);
      }
      const [first, second] = tuple;
      return `${globalObjectIdGenerator.getStringId(first)}|${globalObjectIdGenerator.getStringId(second)}`;
    };
    for (const [data, multiplicity] of this.#inner) {
      if (!Array.isArray(data) || data.length !== 2) {
        return this.#consolidateUnkeyed();
      }
      const [key, value] = data;
      if (typeof key !== `string` && typeof key !== `number`) {
        return this.#consolidateUnkeyed();
      }
      let valueId;
      if (Array.isArray(value) && value.length === 2) {
        valueId = getTupleId(value);
      } else {
        valueId = globalObjectIdGenerator.getStringId(value);
      }
      const compositeKey = key + `|` + valueId;
      consolidated.set(
        compositeKey,
        (consolidated.get(compositeKey) || 0) + multiplicity
      );
      if (!values.has(compositeKey)) {
        values.set(compositeKey, data);
      }
    }
    const result = [];
    for (const [compositeKey, multiplicity] of consolidated) {
      if (multiplicity !== 0) {
        result.push([values.get(compositeKey), multiplicity]);
      }
    }
    return new MultiSet(result);
  }
  /**
   * Private method for consolidating unkeyed multisets using the original approach.
   */
  #consolidateUnkeyed() {
    const consolidated = new DefaultMap(() => 0);
    const values = /* @__PURE__ */ new Map();
    let hasString = false;
    let hasNumber = false;
    let hasOther = false;
    for (const [data, _] of this.#inner) {
      if (typeof data === `string`) {
        hasString = true;
      } else if (typeof data === `number`) {
        hasNumber = true;
      } else {
        hasOther = true;
        break;
      }
    }
    const requireJson = hasOther || hasString && hasNumber;
    for (const [data, multiplicity] of this.#inner) {
      const key = requireJson ? hash(data) : data;
      if (requireJson && !values.has(key)) {
        values.set(key, data);
      }
      consolidated.update(key, (count2) => count2 + multiplicity);
    }
    const result = [];
    for (const [key, multiplicity] of consolidated.entries()) {
      if (multiplicity !== 0) {
        const parsedKey = requireJson ? values.get(key) : key;
        result.push([parsedKey, multiplicity]);
      }
    }
    return new MultiSet(result);
  }
  extend(other) {
    const otherArray = other instanceof MultiSet ? other.getInner() : other;
    chunkedArrayPush(this.#inner, otherArray);
  }
  add(item, multiplicity) {
    if (multiplicity !== 0) {
      this.#inner.push([item, multiplicity]);
    }
  }
  getInner() {
    return this.#inner;
  }
}
class DifferenceStreamReader {
  #queue;
  constructor(queue) {
    this.#queue = queue;
  }
  drain() {
    const out = [...this.#queue].reverse();
    this.#queue.length = 0;
    return out;
  }
  isEmpty() {
    return this.#queue.length === 0;
  }
}
class DifferenceStreamWriter {
  #queues = [];
  sendData(collection) {
    if (!(collection instanceof MultiSet)) {
      collection = new MultiSet(collection);
    }
    for (const q of this.#queues) {
      q.unshift(collection);
    }
  }
  newReader() {
    const q = [];
    this.#queues.push(q);
    return new DifferenceStreamReader(q);
  }
}
class Operator {
  constructor(id, inputs, output2) {
    this.id = id;
    this.inputs = inputs;
    this.output = output2;
  }
  hasPendingWork() {
    return this.inputs.some((input) => !input.isEmpty());
  }
}
class UnaryOperator extends Operator {
  constructor(id, inputA, output2) {
    super(id, [inputA], output2);
    this.id = id;
  }
  inputMessages() {
    return this.inputs[0].drain();
  }
}
class BinaryOperator extends Operator {
  constructor(id, inputA, inputB, output2) {
    super(id, [inputA, inputB], output2);
    this.id = id;
  }
  inputAMessages() {
    return this.inputs[0].drain();
  }
  inputBMessages() {
    return this.inputs[1].drain();
  }
}
class LinearUnaryOperator extends UnaryOperator {
  run() {
    for (const message of this.inputMessages()) {
      this.output.sendData(this.inner(message));
    }
  }
}
class D2 {
  #operators = [];
  #nextOperatorId = 0;
  #finalized = false;
  constructor() {
  }
  #checkNotFinalized() {
    if (this.#finalized) {
      throw new Error(`Graph already finalized`);
    }
  }
  getNextOperatorId() {
    this.#checkNotFinalized();
    return this.#nextOperatorId++;
  }
  newInput() {
    this.#checkNotFinalized();
    const writer = new DifferenceStreamWriter();
    const streamBuilder = new RootStreamBuilder(this, writer);
    return streamBuilder;
  }
  addOperator(operator) {
    this.#checkNotFinalized();
    this.#operators.push(operator);
  }
  finalize() {
    this.#checkNotFinalized();
    this.#finalized = true;
  }
  step() {
    if (!this.#finalized) {
      throw new Error(`Graph not finalized`);
    }
    for (const op of this.#operators) {
      op.run();
    }
  }
  pendingWork() {
    return this.#operators.some((op) => op.hasPendingWork());
  }
  run() {
    while (this.pendingWork()) {
      this.step();
    }
  }
}
class StreamBuilder {
  #graph;
  #writer;
  constructor(graph, writer) {
    this.#graph = graph;
    this.#writer = writer;
  }
  connectReader() {
    return this.#writer.newReader();
  }
  get writer() {
    return this.#writer;
  }
  get graph() {
    return this.#graph;
  }
  pipe(...operators) {
    return operators.reduce((stream, operator) => {
      return operator(stream);
    }, this);
  }
}
class RootStreamBuilder extends StreamBuilder {
  sendData(collection) {
    this.writer.sendData(collection);
  }
}
class MapOperator extends LinearUnaryOperator {
  #f;
  constructor(id, inputA, output2, f) {
    super(id, inputA, output2);
    this.#f = f;
  }
  inner(collection) {
    return collection.map(this.#f);
  }
}
function map(f) {
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new MapOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
const NO_PREFIX = /* @__PURE__ */ Symbol(`NO_PREFIX`);
class PrefixMap extends Map {
  /**
   * Add a value to the PrefixMap. Returns true if the map becomes empty after the operation.
   */
  addValue(value, multiplicity) {
    if (multiplicity === 0) return this.size === 0;
    const prefix = getPrefix(value);
    const valueMapOrSingleValue = this.get(prefix);
    if (isSingleValue(valueMapOrSingleValue)) {
      const [currentValue, currentMultiplicity] = valueMapOrSingleValue;
      const currentPrefix = getPrefix(currentValue);
      if (currentPrefix !== prefix) {
        throw new Error(`Mismatching prefixes, this should never happen`);
      }
      if (currentValue === value || hash(currentValue) === hash(value)) {
        const newMultiplicity = currentMultiplicity + multiplicity;
        if (newMultiplicity === 0) {
          this.delete(prefix);
        } else {
          this.set(prefix, [value, newMultiplicity]);
        }
      } else {
        const valueMap = new ValueMap();
        valueMap.set(hash(currentValue), valueMapOrSingleValue);
        valueMap.set(hash(value), [value, multiplicity]);
        this.set(prefix, valueMap);
      }
    } else if (valueMapOrSingleValue === void 0) {
      this.set(prefix, [value, multiplicity]);
    } else {
      const isEmpty = valueMapOrSingleValue.addValue(value, multiplicity);
      if (isEmpty) {
        this.delete(prefix);
      }
    }
    return this.size === 0;
  }
}
class ValueMap extends Map {
  /**
   * Add a value to the ValueMap. Returns true if the map becomes empty after the operation.
   * @param value - The full value to store
   * @param multiplicity - The multiplicity to add
   * @param hashKey - Optional hash key to use instead of hashing the full value (used when in PrefixMap context)
   */
  addValue(value, multiplicity) {
    if (multiplicity === 0) return this.size === 0;
    const key = hash(value);
    const currentValue = this.get(key);
    if (currentValue) {
      const [, currentMultiplicity] = currentValue;
      const newMultiplicity = currentMultiplicity + multiplicity;
      if (newMultiplicity === 0) {
        this.delete(key);
      } else {
        this.set(key, [value, newMultiplicity]);
      }
    } else {
      this.set(key, [value, multiplicity]);
    }
    return this.size === 0;
  }
}
class Index {
  /*
   * This index maintains a nested map of keys -> (value, multiplicities), where:
   * - initially the values are stored against the key as a single value tuple
   * - when a key gets additional values, the values are stored against the key in a
   *   prefix map
   * - the prefix is extract where possible from values that are structured as
   *   [rowPrimaryKey, rowValue], as they are in the Tanstack DB query pipeline.
   * - only when there are multiple values for a given prefix do we fall back to a
   *   hash to identify identical values, storing them in a third level value map.
   */
  #inner;
  #consolidatedMultiplicity = /* @__PURE__ */ new Map();
  // sum of multiplicities per key
  constructor() {
    this.#inner = /* @__PURE__ */ new Map();
  }
  /**
   * Create an Index from multiple MultiSet messages.
   * @param messages - Array of MultiSet messages to build the index from.
   * @returns A new Index containing all the data from the messages.
   */
  static fromMultiSets(messages) {
    const index = new Index();
    for (const message of messages) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item;
        index.addValue(key, [value, multiplicity]);
      }
    }
    return index;
  }
  /**
   * This method returns a string representation of the index.
   * @param indent - Whether to indent the string representation.
   * @returns A string representation of the index.
   */
  toString(indent = false) {
    return `Index(${JSON.stringify(
      [...this.entries()],
      void 0,
      indent ? 2 : void 0
    )})`;
  }
  /**
   * The size of the index.
   */
  get size() {
    return this.#inner.size;
  }
  /**
   * This method checks if the index has a given key.
   * @param key - The key to check.
   * @returns True if the index has the key, false otherwise.
   */
  has(key) {
    return this.#inner.has(key);
  }
  /**
   * Check if a key has presence (non-zero consolidated multiplicity).
   * @param key - The key to check.
   * @returns True if the key has non-zero consolidated multiplicity, false otherwise.
   */
  hasPresence(key) {
    return (this.#consolidatedMultiplicity.get(key) || 0) !== 0;
  }
  /**
   * Get the consolidated multiplicity (sum of multiplicities) for a key.
   * @param key - The key to get the consolidated multiplicity for.
   * @returns The consolidated multiplicity for the key.
   */
  getConsolidatedMultiplicity(key) {
    return this.#consolidatedMultiplicity.get(key) || 0;
  }
  /**
   * Get all keys that have presence (non-zero consolidated multiplicity).
   * @returns An iterator of keys with non-zero consolidated multiplicity.
   */
  getPresenceKeys() {
    return this.#consolidatedMultiplicity.keys();
  }
  /**
   * This method returns all values for a given key.
   * @param key - The key to get the values for.
   * @returns An array of value tuples [value, multiplicity].
   */
  get(key) {
    return [...this.getIterator(key)];
  }
  /**
   * This method returns an iterator over all values for a given key.
   * @param key - The key to get the values for.
   * @returns An iterator of value tuples [value, multiplicity].
   */
  *getIterator(key) {
    const mapOrSingleValue = this.#inner.get(key);
    if (isSingleValue(mapOrSingleValue)) {
      yield mapOrSingleValue;
    } else if (mapOrSingleValue === void 0) {
      return;
    } else if (mapOrSingleValue instanceof ValueMap) {
      for (const valueTuple of mapOrSingleValue.values()) {
        yield valueTuple;
      }
    } else {
      for (const singleValueOrValueMap of mapOrSingleValue.values()) {
        if (isSingleValue(singleValueOrValueMap)) {
          yield singleValueOrValueMap;
        } else {
          for (const valueTuple of singleValueOrValueMap.values()) {
            yield valueTuple;
          }
        }
      }
    }
  }
  /**
   * This returns an iterator that iterates over all key-value pairs.
   * @returns An iterable of all key-value pairs (and their multiplicities) in the index.
   */
  *entries() {
    for (const key of this.#inner.keys()) {
      for (const valueTuple of this.getIterator(key)) {
        yield [key, valueTuple];
      }
    }
  }
  /**
   * This method only iterates over the keys and not over the values.
   * Hence, it is more efficient than the `#entries` method.
   * It returns an iterator that you can use if you need to iterate over the values for a given key.
   * @returns An iterator of all *keys* in the index and their corresponding value iterator.
   */
  *entriesIterators() {
    for (const key of this.#inner.keys()) {
      yield [key, this.getIterator(key)];
    }
  }
  /**
   * This method adds a value to the index.
   * @param key - The key to add the value to.
   * @param valueTuple - The value tuple [value, multiplicity] to add to the index.
   */
  addValue(key, valueTuple) {
    const [value, multiplicity] = valueTuple;
    if (multiplicity === 0) return;
    const newConsolidatedMultiplicity = (this.#consolidatedMultiplicity.get(key) || 0) + multiplicity;
    if (newConsolidatedMultiplicity === 0) {
      this.#consolidatedMultiplicity.delete(key);
    } else {
      this.#consolidatedMultiplicity.set(key, newConsolidatedMultiplicity);
    }
    const mapOrSingleValue = this.#inner.get(key);
    if (mapOrSingleValue === void 0) {
      this.#inner.set(key, valueTuple);
      return;
    }
    if (isSingleValue(mapOrSingleValue)) {
      this.#handleSingleValueTransition(
        key,
        mapOrSingleValue,
        value,
        multiplicity
      );
      return;
    }
    if (mapOrSingleValue instanceof ValueMap) {
      const prefix = getPrefix(value);
      if (prefix !== NO_PREFIX) {
        const prefixMap = new PrefixMap();
        prefixMap.set(NO_PREFIX, mapOrSingleValue);
        prefixMap.set(prefix, valueTuple);
        this.#inner.set(key, prefixMap);
      } else {
        const isEmpty = mapOrSingleValue.addValue(value, multiplicity);
        if (isEmpty) {
          this.#inner.delete(key);
        }
      }
    } else {
      const isEmpty = mapOrSingleValue.addValue(value, multiplicity);
      if (isEmpty) {
        this.#inner.delete(key);
      }
    }
  }
  /**
   * Handle the transition from a single value to either a ValueMap or PrefixMap
   */
  #handleSingleValueTransition(key, currentSingleValue, newValue, multiplicity) {
    const [currentValue, currentMultiplicity] = currentSingleValue;
    if (currentValue === newValue) {
      const newMultiplicity = currentMultiplicity + multiplicity;
      if (newMultiplicity === 0) {
        this.#inner.delete(key);
      } else {
        this.#inner.set(key, [newValue, newMultiplicity]);
      }
      return;
    }
    const newPrefix = getPrefix(newValue);
    const currentPrefix = getPrefix(currentValue);
    if (currentPrefix === newPrefix && (currentValue === newValue || hash(currentValue) === hash(newValue))) {
      const newMultiplicity = currentMultiplicity + multiplicity;
      if (newMultiplicity === 0) {
        this.#inner.delete(key);
      } else {
        this.#inner.set(key, [newValue, newMultiplicity]);
      }
      return;
    }
    if (currentPrefix === NO_PREFIX && newPrefix === NO_PREFIX) {
      const valueMap = new ValueMap();
      valueMap.set(hash(currentValue), currentSingleValue);
      valueMap.set(hash(newValue), [newValue, multiplicity]);
      this.#inner.set(key, valueMap);
    } else {
      const prefixMap = new PrefixMap();
      if (currentPrefix === newPrefix) {
        const valueMap = new ValueMap();
        valueMap.set(hash(currentValue), currentSingleValue);
        valueMap.set(hash(newValue), [newValue, multiplicity]);
        prefixMap.set(currentPrefix, valueMap);
      } else {
        prefixMap.set(currentPrefix, currentSingleValue);
        prefixMap.set(newPrefix, [newValue, multiplicity]);
      }
      this.#inner.set(key, prefixMap);
    }
  }
  /**
   * This method appends another index to the current index.
   * @param other - The index to append to the current index.
   */
  append(other) {
    for (const [key, value] of other.entries()) {
      this.addValue(key, value);
    }
  }
  /**
   * This method joins two indexes.
   * @param other - The index to join with the current index.
   * @returns A multiset of the joined values.
   */
  join(other) {
    const result = [];
    if (this.size <= other.size) {
      for (const [key, valueIt] of this.entriesIterators()) {
        if (!other.has(key)) continue;
        const otherValues = other.get(key);
        for (const [val1, mul1] of valueIt) {
          for (const [val2, mul2] of otherValues) {
            if (mul1 !== 0 && mul2 !== 0) {
              result.push([[key, [val1, val2]], mul1 * mul2]);
            }
          }
        }
      }
    } else {
      for (const [key, otherValueIt] of other.entriesIterators()) {
        if (!this.has(key)) continue;
        const values = this.get(key);
        for (const [val2, mul2] of otherValueIt) {
          for (const [val1, mul1] of values) {
            if (mul1 !== 0 && mul2 !== 0) {
              result.push([[key, [val1, val2]], mul1 * mul2]);
            }
          }
        }
      }
    }
    return new MultiSet(result);
  }
}
function getPrefix(value) {
  if (Array.isArray(value) && (typeof value[0] === `string` || typeof value[0] === `number` || typeof value[0] === `bigint`)) {
    return value[0];
  }
  return NO_PREFIX;
}
function isSingleValue(value) {
  return Array.isArray(value);
}
class ReduceOperator extends UnaryOperator {
  #index = new Index();
  #indexOut = new Index();
  #f;
  constructor(id, inputA, output2, f) {
    super(id, inputA, output2);
    this.#f = f;
  }
  run() {
    const keysTodo = /* @__PURE__ */ new Set();
    for (const message of this.inputMessages()) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item;
        this.#index.addValue(key, [value, multiplicity]);
        keysTodo.add(key);
      }
    }
    const result = [];
    for (const key of keysTodo) {
      const curr = this.#index.get(key);
      const currOut = this.#indexOut.get(key);
      const out = this.#f(curr);
      const newOutputMap = /* @__PURE__ */ new Map();
      const oldOutputMap = /* @__PURE__ */ new Map();
      for (const [value, multiplicity] of out) {
        const existing = newOutputMap.get(value) ?? 0;
        newOutputMap.set(value, existing + multiplicity);
      }
      for (const [value, multiplicity] of currOut) {
        const existing = oldOutputMap.get(value) ?? 0;
        oldOutputMap.set(value, existing + multiplicity);
      }
      for (const [value, multiplicity] of oldOutputMap) {
        if (!newOutputMap.has(value)) {
          result.push([[key, value], -multiplicity]);
          this.#indexOut.addValue(key, [value, -multiplicity]);
        }
      }
      for (const [value, multiplicity] of newOutputMap) {
        if (!oldOutputMap.has(value)) {
          if (multiplicity !== 0) {
            result.push([[key, value], multiplicity]);
            this.#indexOut.addValue(key, [value, multiplicity]);
          }
        }
      }
      for (const [value, newMultiplicity] of newOutputMap) {
        const oldMultiplicity = oldOutputMap.get(value);
        if (oldMultiplicity !== void 0) {
          const delta = newMultiplicity - oldMultiplicity;
          if (delta !== 0) {
            result.push([[key, value], delta]);
            this.#indexOut.addValue(key, [value, delta]);
          }
        }
      }
    }
    if (result.length > 0) {
      this.output.sendData(new MultiSet(result));
    }
  }
}
function reduce(f) {
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new ReduceOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
function isPipedAggregateFunction(aggregate) {
  return `pipe` in aggregate;
}
function groupBy(keyExtractor, aggregates = {}) {
  const basicAggregates = Object.fromEntries(
    Object.entries(aggregates).filter(
      ([_, aggregate]) => !isPipedAggregateFunction(aggregate)
    )
  );
  Object.fromEntries(
    Object.entries(aggregates).filter(
      ([_, aggregate]) => isPipedAggregateFunction(aggregate)
    )
  );
  return (stream) => {
    const KEY_SENTINEL = `__original_key__`;
    const withKeysAndValues = stream.pipe(
      map((data) => {
        const key = keyExtractor(data);
        const keyString = serializeValue(key);
        const values = {};
        values[KEY_SENTINEL] = key;
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          values[name] = aggregate.preMap(data);
        }
        return [keyString, values];
      })
    );
    const reduced = withKeysAndValues.pipe(
      reduce((values) => {
        let totalMultiplicity = 0;
        for (const [_, multiplicity] of values) {
          totalMultiplicity += multiplicity;
        }
        if (totalMultiplicity <= 0) {
          return [];
        }
        const result = {};
        const originalKey = values[0]?.[0]?.[KEY_SENTINEL];
        result[KEY_SENTINEL] = originalKey;
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          const preValues = values.map(
            ([v, m]) => [v[name], m]
          );
          result[name] = aggregate.reduce(preValues);
        }
        return [[result, 1]];
      })
    );
    return reduced.pipe(
      map(([keyString, values]) => {
        const key = values[KEY_SENTINEL];
        const result = {};
        Object.assign(result, key);
        for (const [name, aggregate] of Object.entries(basicAggregates)) {
          if (aggregate.postMap) {
            result[name] = aggregate.postMap(values[name]);
          } else {
            result[name] = values[name];
          }
        }
        return [keyString, result];
      })
    );
  };
}
function sum(valueExtractor = (v) => v) {
  return {
    preMap: (data) => valueExtractor(data),
    reduce: (values) => {
      let total = 0;
      for (const [value, multiplicity] of values) {
        total += value * multiplicity;
      }
      return total;
    }
  };
}
function count(valueExtractor = (v) => v) {
  return {
    // Count only not-null values (the `== null` comparison gives true for both null and undefined)
    preMap: (data) => valueExtractor(data) == null ? 0 : 1,
    reduce: (values) => {
      let totalCount = 0;
      for (const [nullMultiplier, multiplicity] of values) {
        totalCount += nullMultiplier * multiplicity;
      }
      return totalCount;
    }
  };
}
function avg(valueExtractor = (v) => v) {
  return {
    preMap: (data) => ({
      sum: valueExtractor(data),
      count: 0
    }),
    reduce: (values) => {
      let totalSum = 0;
      let totalCount = 0;
      for (const [value, multiplicity] of values) {
        totalSum += value.sum * multiplicity;
        totalCount += multiplicity;
      }
      return {
        sum: totalSum,
        count: totalCount
      };
    },
    postMap: (result) => {
      return result.sum / result.count;
    }
  };
}
function min(valueExtractor) {
  const extractor = valueExtractor ?? ((v) => v);
  return {
    preMap: (data) => extractor(data),
    reduce: (values) => {
      let minValue;
      for (const [value, _multiplicity] of values) {
        if (!minValue || value && value < minValue) {
          minValue = value;
        }
      }
      return minValue;
    }
  };
}
function max(valueExtractor) {
  const extractor = valueExtractor ?? ((v) => v);
  return {
    preMap: (data) => extractor(data),
    reduce: (values) => {
      let maxValue;
      for (const [value, _multiplicity] of values) {
        if (!maxValue || value && value > maxValue) {
          maxValue = value;
        }
      }
      return maxValue;
    }
  };
}
const groupByOperators = {
  sum,
  count,
  avg,
  min,
  max
};
class TapOperator extends LinearUnaryOperator {
  #f;
  constructor(id, inputA, output2, f) {
    super(id, inputA, output2);
    this.#f = f;
  }
  inner(collection) {
    this.#f(collection);
    return collection;
  }
}
function tap(f) {
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new TapOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
class FilterOperator extends LinearUnaryOperator {
  #f;
  constructor(id, inputA, output2, f) {
    super(id, inputA, output2);
    this.#f = f;
  }
  inner(collection) {
    return collection.filter(this.#f);
  }
}
function filter(f) {
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new FilterOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
class OutputOperator extends UnaryOperator {
  #fn;
  constructor(id, inputA, outputWriter, fn) {
    super(id, inputA, outputWriter);
    this.#fn = fn;
  }
  run() {
    for (const message of this.inputMessages()) {
      this.#fn(message);
      this.output.sendData(message);
    }
  }
}
function output(fn) {
  return (stream) => {
    const outputStream = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new OutputOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      outputStream.writer,
      fn
    );
    stream.graph.addOperator(operator);
    return outputStream;
  };
}
class ConsolidateOperator extends UnaryOperator {
  run() {
    const messages = this.inputMessages();
    if (messages.length === 0) {
      return;
    }
    const combined = new MultiSet();
    for (const message of messages) {
      combined.extend(message);
    }
    const consolidated = combined.consolidate();
    if (consolidated.getInner().length > 0) {
      this.output.sendData(consolidated);
    }
  }
}
function consolidate() {
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new ConsolidateOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
class JoinOperator extends BinaryOperator {
  #indexA = new Index();
  #indexB = new Index();
  #mode;
  constructor(id, inputA, inputB, output2, mode = `inner`) {
    super(id, inputA, inputB, output2);
    this.#mode = mode;
  }
  run() {
    const deltaA = Index.fromMultiSets(
      this.inputAMessages()
    );
    const deltaB = Index.fromMultiSets(
      this.inputBMessages()
    );
    if (deltaA.size === 0 && deltaB.size === 0) return;
    const results = new MultiSet();
    if (this.#mode !== `anti`) {
      this.emitInnerResults(deltaA, deltaB, results);
    }
    if (this.#mode === `left` || this.#mode === `full` || this.#mode === `anti`) {
      this.emitLeftOuterResults(deltaA, deltaB, results);
    }
    if (this.#mode === `right` || this.#mode === `full`) {
      this.emitRightOuterResults(deltaA, deltaB, results);
    }
    this.#indexA.append(deltaA);
    this.#indexB.append(deltaB);
    if (results.getInner().length > 0) {
      this.output.sendData(results);
    }
  }
  emitInnerResults(deltaA, deltaB, results) {
    if (deltaA.size > 0) results.extend(deltaA.join(this.#indexB));
    if (deltaB.size > 0) results.extend(this.#indexA.join(deltaB));
    if (deltaA.size > 0 && deltaB.size > 0) results.extend(deltaA.join(deltaB));
  }
  emitLeftOuterResults(deltaA, deltaB, results) {
    if (deltaA.size > 0) {
      for (const [key, valueIterator] of deltaA.entriesIterators()) {
        const currentMultiplicityB = this.#indexB.getConsolidatedMultiplicity(key);
        const deltaMultiplicityB = deltaB.getConsolidatedMultiplicity(key);
        const finalMultiplicityB = currentMultiplicityB + deltaMultiplicityB;
        if (finalMultiplicityB === 0) {
          for (const [value, multiplicity] of valueIterator) {
            if (multiplicity !== 0) {
              results.add([key, [value, null]], multiplicity);
            }
          }
        }
      }
    }
    if (deltaB.size > 0) {
      for (const key of deltaB.getPresenceKeys()) {
        const before = this.#indexB.getConsolidatedMultiplicity(key);
        const deltaMult = deltaB.getConsolidatedMultiplicity(key);
        if (deltaMult === 0) continue;
        const after = before + deltaMult;
        if (before === 0 === (after === 0)) continue;
        const transitioningToMatched = before === 0;
        for (const [value, multiplicity] of this.#indexA.getIterator(key)) {
          if (multiplicity !== 0) {
            results.add(
              [key, [value, null]],
              transitioningToMatched ? -multiplicity : +multiplicity
            );
          }
        }
      }
    }
  }
  emitRightOuterResults(deltaA, deltaB, results) {
    if (deltaB.size > 0) {
      for (const [key, valueIterator] of deltaB.entriesIterators()) {
        const currentMultiplicityA = this.#indexA.getConsolidatedMultiplicity(key);
        const deltaMultiplicityA = deltaA.getConsolidatedMultiplicity(key);
        const finalMultiplicityA = currentMultiplicityA + deltaMultiplicityA;
        if (finalMultiplicityA === 0) {
          for (const [value, multiplicity] of valueIterator) {
            if (multiplicity !== 0) {
              results.add([key, [null, value]], multiplicity);
            }
          }
        }
      }
    }
    if (deltaA.size > 0) {
      for (const key of deltaA.getPresenceKeys()) {
        const before = this.#indexA.getConsolidatedMultiplicity(key);
        const deltaMult = deltaA.getConsolidatedMultiplicity(key);
        if (deltaMult === 0) continue;
        const after = before + deltaMult;
        if (before === 0 === (after === 0)) continue;
        const transitioningToMatched = before === 0;
        for (const [value, multiplicity] of this.#indexB.getIterator(key)) {
          if (multiplicity !== 0) {
            results.add(
              [key, [null, value]],
              transitioningToMatched ? -multiplicity : +multiplicity
            );
          }
        }
      }
    }
  }
}
function join(other, type = `inner`) {
  return (stream) => {
    if (stream.graph !== other.graph) {
      throw new Error(`Cannot join streams from different graphs`);
    }
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new JoinOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      other.connectReader(),
      output2.writer,
      type
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
class DistinctOperator extends UnaryOperator {
  #by;
  #values;
  // keeps track of the number of times each value has been seen
  constructor(id, input, output2, by = (value) => value) {
    super(id, input, output2);
    this.#by = by;
    this.#values = /* @__PURE__ */ new Map();
  }
  run() {
    const updatedValues = /* @__PURE__ */ new Map();
    for (const message of this.inputMessages()) {
      for (const [value, diff] of message.getInner()) {
        const hashedValue = hash(this.#by(value));
        const oldMultiplicity = updatedValues.get(hashedValue)?.[0] ?? this.#values.get(hashedValue) ?? 0;
        const newMultiplicity = oldMultiplicity + diff;
        updatedValues.set(hashedValue, [newMultiplicity, value]);
      }
    }
    const result = [];
    for (const [
      hashedValue,
      [newMultiplicity, value]
    ] of updatedValues.entries()) {
      const oldMultiplicity = this.#values.get(hashedValue) ?? 0;
      if (newMultiplicity === 0) {
        this.#values.delete(hashedValue);
      } else {
        this.#values.set(hashedValue, newMultiplicity);
      }
      if (oldMultiplicity <= 0 && newMultiplicity > 0) {
        result.push([[hash(this.#by(value)), value[1]], 1]);
      } else if (oldMultiplicity > 0 && newMultiplicity <= 0) {
        result.push([[hash(this.#by(value)), value[1]], -1]);
      }
    }
    if (result.length > 0) {
      this.output.sendData(new MultiSet(result));
    }
  }
}
function distinct(by = (value) => value) {
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new DistinctOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer,
      by
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
function indexedValue(value, index) {
  return [value, index];
}
function getValue(indexedVal) {
  return indexedVal[0];
}
function getIndex(indexedVal) {
  return indexedVal[1];
}
function createKeyedComparator(comparator) {
  return ([aKey, aVal], [bKey, bVal]) => {
    const valueComparison = comparator(aVal, bVal);
    if (valueComparison !== 0) {
      return valueComparison;
    }
    return compareKeys(aKey, bKey);
  };
}
class TopKArray {
  #sortedValues = [];
  #comparator;
  #topKStart;
  #topKEnd;
  constructor(offset, limit, comparator) {
    this.#topKStart = offset;
    this.#topKEnd = offset + limit;
    this.#comparator = comparator;
  }
  get size() {
    const offset = this.#topKStart;
    const limit = this.#topKEnd - this.#topKStart;
    const available = this.#sortedValues.length - offset;
    return Math.max(0, Math.min(limit, available));
  }
  /**
   * Moves the topK window
   */
  move({
    offset,
    limit
  }) {
    const oldOffset = this.#topKStart;
    const oldLimit = this.#topKEnd - this.#topKStart;
    const oldRange = [
      this.#topKStart,
      this.#topKEnd === Infinity ? this.#topKStart + this.size : this.#topKEnd
    ];
    this.#topKStart = offset ?? oldOffset;
    this.#topKEnd = this.#topKStart + (limit ?? oldLimit);
    const newRange = [
      this.#topKStart,
      this.#topKEnd === Infinity ? Math.max(this.#topKStart + this.size, oldRange[1]) : this.#topKEnd
    ];
    const { onlyInA, onlyInB } = diffHalfOpen(oldRange, newRange);
    const moveIns = [];
    onlyInB.forEach((index) => {
      const value = this.#sortedValues[index];
      if (value) {
        moveIns.push(value);
      }
    });
    const moveOuts = [];
    onlyInA.forEach((index) => {
      const value = this.#sortedValues[index];
      if (value) {
        moveOuts.push(value);
      }
    });
    return { moveIns, moveOuts, changes: onlyInA.length + onlyInB.length > 0 };
  }
  insert(value) {
    const result = { moveIn: null, moveOut: null };
    const index = this.#findIndex(value);
    const indexBefore = index === 0 ? null : getIndex(this.#sortedValues[index - 1]);
    const indexAfter = index === this.#sortedValues.length ? null : getIndex(this.#sortedValues[index]);
    const fractionalIndex = generateKeyBetween(indexBefore, indexAfter);
    const val = indexedValue(value, fractionalIndex);
    this.#sortedValues.splice(index, 0, val);
    if (index < this.#topKEnd) {
      const moveInIndex = Math.max(index, this.#topKStart);
      if (moveInIndex < this.#sortedValues.length) {
        result.moveIn = this.#sortedValues[moveInIndex];
        if (this.#topKEnd < this.#sortedValues.length) {
          result.moveOut = this.#sortedValues[this.#topKEnd];
        }
      }
    }
    return result;
  }
  /**
   * Deletes a value that may or may not be in the topK.
   * IMPORTANT: this assumes that the value is present in the collection
   *            if it's not the case it will remove the element
   *            that is on the position where the provided `value` would be.
   */
  delete(value) {
    const result = { moveIn: null, moveOut: null };
    const index = this.#findIndex(value);
    const [removedElem] = this.#sortedValues.splice(index, 1);
    if (index < this.#topKEnd) {
      result.moveOut = removedElem;
      if (index < this.#topKStart) {
        const moveOutIndex = this.#topKStart - 1;
        if (moveOutIndex < this.#sortedValues.length) {
          result.moveOut = this.#sortedValues[moveOutIndex];
        } else {
          result.moveOut = null;
        }
      }
      const moveInIndex = this.#topKEnd - 1;
      if (moveInIndex < this.#sortedValues.length) {
        result.moveIn = this.#sortedValues[moveInIndex];
      }
    }
    return result;
  }
  // TODO: see if there is a way to refactor the code for insert and delete in the topK above
  //       because they are very similar, one is shifting the topK window to the left and the other is shifting it to the right
  //       so i have the feeling there is a common pattern here and we can implement both cases using that pattern
  #findIndex(value) {
    return binarySearch(
      this.#sortedValues,
      indexedValue(value, ``),
      (a, b) => this.#comparator(getValue(a), getValue(b))
    );
  }
}
class TopKState {
  #multiplicities = /* @__PURE__ */ new Map();
  #topK;
  constructor(topK) {
    this.#topK = topK;
  }
  get size() {
    return this.#topK.size;
  }
  get isEmpty() {
    return this.#multiplicities.size === 0 && this.#topK.size === 0;
  }
  /**
   * Process an element update (insert or delete based on multiplicity change).
   * Returns the changes to the topK window.
   */
  processElement(key, value, multiplicity) {
    const { oldMultiplicity, newMultiplicity } = this.#updateMultiplicity(
      key,
      multiplicity
    );
    if (oldMultiplicity <= 0 && newMultiplicity > 0) {
      return this.#topK.insert([key, value]);
    } else if (oldMultiplicity > 0 && newMultiplicity <= 0) {
      return this.#topK.delete([key, value]);
    }
    return { moveIn: null, moveOut: null };
  }
  /**
   * Move the topK window. Only works with TopKArray implementation.
   */
  move(options) {
    if (!(this.#topK instanceof TopKArray)) {
      throw new Error(
        `Cannot move B+-tree implementation of TopK with fractional index`
      );
    }
    return this.#topK.move(options);
  }
  #updateMultiplicity(key, multiplicity) {
    if (multiplicity === 0) {
      const current = this.#multiplicities.get(key) ?? 0;
      return { oldMultiplicity: current, newMultiplicity: current };
    }
    const oldMultiplicity = this.#multiplicities.get(key) ?? 0;
    const newMultiplicity = oldMultiplicity + multiplicity;
    if (newMultiplicity === 0) {
      this.#multiplicities.delete(key);
    } else {
      this.#multiplicities.set(key, newMultiplicity);
    }
    return { oldMultiplicity, newMultiplicity };
  }
}
function handleMoveIn(moveIn, result) {
  if (moveIn) {
    const [[key, value], index] = moveIn;
    result.push([[key, [value, index]], 1]);
  }
}
function handleMoveOut(moveOut, result) {
  if (moveOut) {
    const [[key, value], index] = moveOut;
    result.push([[key, [value, index]], -1]);
  }
}
class TopKWithFractionalIndexOperator extends UnaryOperator {
  #state;
  constructor(id, inputA, output2, comparator, options) {
    super(id, inputA, output2);
    const limit = options.limit ?? Infinity;
    const offset = options.offset ?? 0;
    const topK = this.createTopK(
      offset,
      limit,
      createKeyedComparator(comparator)
    );
    this.#state = new TopKState(topK);
    options.setSizeCallback?.(() => this.#state.size);
    options.setWindowFn?.(this.moveTopK.bind(this));
  }
  createTopK(offset, limit, comparator) {
    return new TopKArray(offset, limit, comparator);
  }
  /**
   * Moves the topK window based on the provided offset and limit.
   * Any changes to the topK are sent to the output.
   */
  moveTopK({ offset, limit }) {
    const result = [];
    const diff = this.#state.move({ offset, limit });
    diff.moveIns.forEach((moveIn) => handleMoveIn(moveIn, result));
    diff.moveOuts.forEach((moveOut) => handleMoveOut(moveOut, result));
    if (diff.changes) {
      this.output.sendData(new MultiSet(result));
    }
  }
  run() {
    const result = [];
    for (const message of this.inputMessages()) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item;
        this.processElement(key, value, multiplicity, result);
      }
    }
    if (result.length > 0) {
      this.output.sendData(new MultiSet(result));
    }
  }
  processElement(key, value, multiplicity, result) {
    const changes = this.#state.processElement(key, value, multiplicity);
    handleMoveIn(changes.moveIn, result);
    handleMoveOut(changes.moveOut, result);
  }
}
function topKWithFractionalIndex(comparator, options) {
  const opts = options || {};
  return (stream) => {
    const output2 = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new TopKWithFractionalIndexOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output2.writer,
      comparator,
      opts
    );
    stream.graph.addOperator(operator);
    return output2;
  };
}
function orderByWithFractionalIndexBase(topKFunction, valueExtractor, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  const setSizeCallback = options?.setSizeCallback;
  const setWindowFn = options?.setWindowFn;
  const comparator = options?.comparator ?? ((a, b) => {
    if (a === b) return 0;
    if (a < b) return -1;
    return 1;
  });
  return (stream) => {
    return stream.pipe(
      topKFunction(
        (a, b) => comparator(valueExtractor(a), valueExtractor(b)),
        {
          limit,
          offset,
          setSizeCallback,
          setWindowFn
        }
      ),
      consolidate()
    );
  };
}
function orderByWithFractionalIndex(valueExtractor, options) {
  return orderByWithFractionalIndexBase(
    topKWithFractionalIndex,
    valueExtractor,
    options
  );
}
export {
  D2 as D,
  MultiSet as M,
  groupByOperators as a,
  output as b,
  compareKeys as c,
  distinct as d,
  filter as f,
  groupBy as g,
  join as j,
  map as m,
  orderByWithFractionalIndex as o,
  serializeValue as s,
  tap as t
};
