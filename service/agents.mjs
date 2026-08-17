import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import Agentci from "../index.js";

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = /^CLAUDE_TEST=(.*)$/m.exec(env);
  if (!match) throw Error("No Anthropic key: set ANTHROPIC_API_KEY or CLAUDE_TEST in .env");
  return match[1].trim();
}

const anthropic = new Anthropic({ apiKey: apiKey() });
const MODEL = "claude-opus-5";

const fnSchema = (name, description, properties, required) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});

function CalculatorAgent() {
  this.use({
    sdk: anthropic,
    provider: "anthropic",
    model: MODEL,
    max_tokens: 1024,
    prompt:
      "You are a calculator agent. Use the provided tools for every arithmetic operation — never compute in your head. When you have the final result, call finish with it.",
    schema: [
      fnSchema("add", "Add two numbers", { a: { type: "number" }, b: { type: "number" } }, ["a", "b"]),
      fnSchema("subtract", "Subtract b from a", { a: { type: "number" }, b: { type: "number" } }, ["a", "b"]),
      fnSchema("multiply", "Multiply two numbers", { a: { type: "number" }, b: { type: "number" } }, ["a", "b"]),
      fnSchema("divide", "Divide a by b", { a: { type: "number" }, b: { type: "number" } }, ["a", "b"]),
      fnSchema("finish", "Return the final answer to the user", { answer: { type: "number" } }, ["answer"]),
    ],
    exitConditions: { functionCall: "finish", iterations: 6 },
  });
  this.add = async ({ a, b }) => a + b;
  this.subtract = async ({ a, b }) => a - b;
  this.multiply = async ({ a, b }) => a * b;
  this.divide = async ({ a, b }) => {
    if (b === 0) throw Error("division by zero");
    return a / b;
  };
  this.finish = async ({ answer }) => ({ answer });
}

function SummarizerAgent() {
  this.use({
    sdk: anthropic,
    provider: "anthropic",
    model: MODEL,
    max_tokens: 512,
    prompt:
      "Summarize the user's input in exactly one plain sentence. No preamble, no formatting — just the sentence.",
    exitConditions: { shortCircuit: 1, iterations: 2 },
  });
}

function PoetAgent() {
  this.use({
    sdk: anthropic,
    provider: "anthropic",
    model: MODEL,
    max_tokens: 512,
    prompt: "You write exactly two rhyming lines on the requested topic. Output only the two lines.",
    exitConditions: { shortCircuit: 1, iterations: 2 },
  });
}

function CoordinatorAgent() {
  this.use({
    sdk: anthropic,
    provider: "anthropic",
    model: MODEL,
    max_tokens: 1024,
    prompt:
      "You coordinate a team. For any request involving a poem, delegate by calling askPoet with the topic, then call finish passing along the poem you received.",
    schema: [
      fnSchema("askPoet", "Ask the Poet agent for a two-line poem on a topic", { topic: { type: "string" } }, ["topic"]),
      fnSchema("finish", "Deliver the final response to the user", { response: { type: "string" } }, ["response"]),
    ],
    exitConditions: { functionCall: "finish", iterations: 4 },
  });
  this.askPoet = async ({ topic }, { agents }) => agents.Poet.invoke(`Write a poem about: ${topic}`);
  this.finish = async ({ response }) => response;
}

const asModule = ({ invoke, insertMessage, getNormalizedMessages }) => ({
  invoke,
  insertMessage,
  getNormalizedMessages,
});

export const Calculator = asModule(Agentci().rootAgent(CalculatorAgent));
export const Summarizer = asModule(Agentci().rootAgent(SummarizerAgent));
export const Team = asModule(Agentci().rootAgent(CoordinatorAgent).agent("Poet", PoetAgent));
