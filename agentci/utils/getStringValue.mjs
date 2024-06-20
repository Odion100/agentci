export default function getStringValue(value) {
  if (typeof value === "string") {
    return value;
  } else if (typeof value === "number") {
    return value.toString();
  } else if (typeof value === "boolean") {
    return value ? "true" : "false";
  } else if (typeof value === "function") {
    return "Function";
  } else if (typeof value === "object") {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    } else if (value === null) {
      return "null";
    } else {
      return JSON.stringify(value);
    }
  } else if (typeof value === "undefined") {
    return "undefined";
  } else {
    return "Unknown value";
  }
}
