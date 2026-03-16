function applyMapping(row, mapping, options) {
  const pick = (columns) => {
    const result = {};
    for (const col of columns) {
      if (!(col in row)) continue;
      const raw = row[col];
      result[col] = options.autoParseJson ? tryParseJson(raw) : raw;
    }
    const firstCol = columns[0];
    if (options.flattenSingleColumn && columns.length === 1 && firstCol && firstCol in result) {
      return { value: result[firstCol] };
    }
    return result;
  };
  return {
    input: pick(mapping.input),
    output: pick(mapping.output),
    metadata: pick(mapping.metadata)
  };
}
function tryParseJson(value) {
  const trimmed = value.trim();
  if (trimmed === "") return value;
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const asNumber = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(asNumber)) return asNumber;
  if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}
export {
  applyMapping as a
};
