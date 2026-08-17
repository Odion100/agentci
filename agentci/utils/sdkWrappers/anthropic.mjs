import {
  parseArgs,
  parseInput,
  normalizeMessages,
  deNormalizeMessages,
} from "./messageFormat.mjs";
import validateSchema from "./validateSchema.mjs";

export function toImageBlock(imageUrl) {
  const url = typeof imageUrl === "string" ? imageUrl : imageUrl.url;
  const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(url);
  if (match) {
    return {
      type: "image",
      source: { type: "base64", media_type: match[1], data: match[2] },
    };
  }
  return { type: "image", source: { type: "url", url } };
}

export function toContentBlocks(content) {
  if (typeof content === "string") return content;
  return content.map((item) => {
    if (item.type === "text") return { type: "text", text: item.text };
    if (item.type === "image_url") return toImageBlock(item.image_url);
    return item;
  });
}

// state.messages stays in the framework's OpenAI-shaped format so providers can be
// switched mid-run; conversion to Anthropic's format happens per request.
export function convertMessages(messages) {
  let system;
  const converted = [];
  for (const message of messages) {
    if (message.role === "system") {
      system = typeof message.content === "string" ? message.content : "";
    } else if (message.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: message.tool_call_id,
        content: message.content || "",
      };
      const last = converted[converted.length - 1];
      if (
        last &&
        last.role === "user" &&
        Array.isArray(last.content) &&
        last.content[0] &&
        last.content[0].type === "tool_result"
      ) {
        last.content.push(block);
      } else {
        converted.push({ role: "user", content: [block] });
      }
    } else if (message.role === "assistant") {
      const blocks = [];
      if (typeof message.content === "string" && message.content.length) {
        blocks.push({ type: "text", text: message.content });
      }
      if (message.tool_calls) {
        for (const call of message.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: call.id,
            name: call.function.name,
            input: parseArgs(call.function.arguments),
          });
        }
      }
      if (blocks.length) converted.push({ role: "assistant", content: blocks });
    } else {
      converted.push({ role: message.role, content: toContentBlocks(message.content) });
    }
  }
  return { system, messages: converted };
}

export function convertRequest(payload) {
  const { system, messages } = convertMessages(payload.messages);
  const request = {
    model: payload.model,
    max_tokens: payload.max_tokens || 4096,
    messages,
  };
  if (system) request.system = system;
  if (payload.temperature !== undefined) request.temperature = payload.temperature;
  if (payload.tools && payload.tools.length) {
    request.tools = payload.tools.map(({ function: fn }) => ({
      name: fn.name,
      description: fn.description,
      input_schema: fn.parameters,
    }));
    request.tool_choice = { type: "auto" };
  }
  return request;
}

export function convertResponse(response) {
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const toolUses = response.content.filter((block) => block.type === "tool_use");

  const message = { role: "assistant", content: text || null };
  let functionCalls = null;
  if (toolUses.length) {
    message.tool_calls = toolUses.map((block) => ({
      id: block.id,
      type: "function",
      function: { name: block.name, arguments: JSON.stringify(block.input) },
    }));
    functionCalls = message.tool_calls;
  }
  return { message, functionCalls };
}

export default function anthropicWrapper(anthropic) {
  async function invoke(payload) {
    const response = await anthropic.messages.create(convertRequest(payload));
    return convertResponse(response);
  }

  return { invoke, validateSchema, parseInput, normalizeMessages, deNormalizeMessages };
}
