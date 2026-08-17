import {
  parseInput,
  normalizeMessages,
  deNormalizeMessages,
} from "./messageFormat.mjs";
import validateSchema from "./validateSchema.mjs";
import withRetry from "./retry.mjs";

export function convertOpenaiRequest(payload) {
  const { strict, responseSchema, retries, onToken, ...wire } = payload;
  if (strict && wire.tools) {
    wire.tools = wire.tools.map((tool) =>
      tool.type === "function"
        ? { ...tool, function: { ...tool.function, strict: true } }
        : tool
    );
  }
  if (responseSchema) {
    wire.response_format = {
      type: "json_schema",
      json_schema: {
        name: responseSchema.name || "response",
        strict: strict === true,
        schema: responseSchema.schema || responseSchema,
      },
    };
  }
  return wire;
}

export default function openaiWrapper(openai) {
  async function invoke(payload) {
    const { retries, onToken } = payload;
    const wire = convertOpenaiRequest(payload);
    if (!onToken) {
      const response = await withRetry(
        () => openai.chat.completions.create(wire),
        retries
      );
      const message = response.choices[0].message;
      return { message, functionCalls: message.tool_calls || null };
    }
    const stream = await withRetry(
      () => openai.chat.completions.create({ ...wire, stream: true }),
      retries
    );
    const message = { role: "assistant", content: null };
    const toolCalls = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        message.content = (message.content || "") + delta.content;
        onToken(delta.content);
      }
      if (delta.tool_calls) {
        for (const partial of delta.tool_calls) {
          const call = (toolCalls[partial.index] ??= {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          });
          if (partial.id) call.id = partial.id;
          if (partial.function?.name) call.function.name += partial.function.name;
          if (partial.function?.arguments)
            call.function.arguments += partial.function.arguments;
        }
      }
    }
    if (toolCalls.length) message.tool_calls = toolCalls;
    return { message, functionCalls: message.tool_calls || null };
  }

  return { invoke, validateSchema, parseInput, normalizeMessages, deNormalizeMessages };
}
