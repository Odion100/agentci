export default function validateSchema(schema, exitConditions = {}) {
  schema.forEach((tool, i) => {
    if (!tool || tool.type !== "function" || typeof tool.function !== "object") {
      throw Error(
        `[Agentci Error]: schema[${i}] must be { type: "function", function: { name, description, parameters } }`
      );
    }
    const { name, parameters } = tool.function;
    if (typeof name !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw Error(`[Agentci Error]: schema[${i}].function.name "${name}" is not a valid identifier`);
    }
    if (parameters !== undefined && (typeof parameters !== "object" || parameters === null)) {
      throw Error(`[Agentci Error]: schema[${i}].function.parameters must be a JSON Schema object`);
    }
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
    const schemaNames = schema.map((tool) => tool.function.name);
    const reachable = exitFns.some((fn) => schemaNames.includes(fn));
    if (!reachable) {
      throw Error(
        `[Agentci Error]: exitConditions.functionCall [${exitFns.join(", ")}] contains no function present in the schema [${schemaNames.join(", ")}], and no iterations/shortCircuit/errors/state fallback is set — the loop could never exit.`
      );
    }
  }

  return schema;
}
