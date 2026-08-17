import {
  parseInput,
  normalizeMessages,
  deNormalizeMessages,
} from "./messageFormat.mjs";
import validateSchema from "./validateSchema.mjs";

export default function openaiWrapper(openai) {
  async function invoke(payload) {
    const response = await openai.chat.completions.create(payload);
    const message = response.choices[0].message;
    const functionCalls = message.tool_calls ? message.tool_calls : null;
    return { message, functionCalls };
  }

  return { invoke, validateSchema, parseInput, normalizeMessages, deNormalizeMessages };
}
