export default function validateSchema(schema, exitConditions = {}, strict = false) {
  const callableNames = [];
  schema.forEach((tool, i) => {
    if (tool && typeof tool.type === "string" && tool.type !== "function") {
      // provider-native tool (computer_*, web_search_*, ...) — passes to the wire untouched
      if (typeof tool.name === "string") callableNames.push(tool.name);
      return;
    }
    if (!tool || tool.type !== "function" || typeof tool.function !== "object") {
      throw Error(
        `[Agentci Error]: schema[${i}] must be { type: "function", function: { name, description, parameters } } or a provider-native tool with its own type`
      );
    }
    const { name, parameters } = tool.function;
    if (typeof name !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw Error(`[Agentci Error]: schema[${i}].function.name "${name}" is not a valid identifier`);
    }
    if (parameters !== undefined && (typeof parameters !== "object" || parameters === null)) {
      throw Error(`[Agentci Error]: schema[${i}].function.parameters must be a JSON Schema object`);
    }
    if (strict && parameters) {
      checkStrictSchema(parameters, `schema[${i}].function.parameters`);
    }
    callableNames.push(name);
  });

  // A functionCall exit the model cannot call (not in the schema) plus no other
  // terminating condition means the loop can never exit — fail loudly instead.
  const exitFns = exitConditions.functionCall || [];
  const hasOtherExit =
    exitConditions.iterations > 0 ||
    exitConditions.shortCircuit > 0 ||
    exitConditions.errors > 0 ||
    typeof exitConditions.state === "function";
  if (exitFns.length && !hasOtherExit) {
    const reachable = exitFns.some((fn) => callableNames.includes(fn));
    if (!reachable) {
      throw Error(
        `[Agentci Error]: exitConditions.functionCall [${exitFns.join(", ")}] contains no function present in the schema [${callableNames.join(", ")}], and no iterations/shortCircuit/errors/state fallback is set — the loop could never exit.`
      );
    }
  }

  return schema;
}

// Mirrors Anthropic's documented strict-mode limits (the stricter of the two providers):
// no recursion, no numeric/string min/max constraints, additionalProperties: false and
// a full required list on every object.
function checkStrictSchema(node, path, seen = new Set()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) {
    throw Error(`[Agentci Error]: ${path} — recursive schemas are not supported in strict mode`);
  }
  seen.add(node);
  for (const key of ["minimum", "maximum", "minLength", "maxLength"]) {
    if (key in node) {
      throw Error(
        `[Agentci Error]: ${path}.${key} — numeric/string min/max constraints are not supported in strict mode`
      );
    }
  }
  if (node.type === "object") {
    if (node.additionalProperties !== false) {
      throw Error(`[Agentci Error]: ${path} must set additionalProperties: false in strict mode`);
    }
    const props = Object.keys(node.properties || {});
    const required = node.required || [];
    const missing = props.filter((prop) => !required.includes(prop));
    if (missing.length) {
      throw Error(
        `[Agentci Error]: ${path}.required must list every property in strict mode (missing: ${missing.join(", ")})`
      );
    }
    for (const prop of props) {
      checkStrictSchema(node.properties[prop], `${path}.properties.${prop}`, seen);
    }
  }
  if (node.type === "array" && node.items) {
    checkStrictSchema(node.items, `${path}.items`, seen);
  }
}
