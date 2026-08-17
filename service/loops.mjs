import Agentci from "../index.js";

function mockOpenai(script) {
  let call = 0;
  const captured = [];
  return {
    captured,
    chat: {
      completions: {
        create: async (payload) => {
          captured.push(JSON.parse(JSON.stringify(payload)));
          return { choices: [{ message: script[Math.min(call++, script.length - 1)] }] };
        },
      },
    },
  };
}

function mockAnthropic(script) {
  let call = 0;
  const captured = [];
  return {
    captured,
    messages: {
      create: async (payload) => {
        captured.push(JSON.parse(JSON.stringify(payload)));
        return script[Math.min(call++, script.length - 1)];
      },
    },
  };
}

const calculatorSchema = [
  { type: "function", function: { name: "add", description: "add two numbers", parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } } } },
  { type: "function", function: { name: "finish", description: "return the final answer", parameters: { type: "object", properties: { answer: { type: "number" } } } } },
];

export async function openaiToolLoop() {
  const openai = mockOpenai([
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "add", arguments: '{"a":2,"b":3}' } }] },
    { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "finish", arguments: '{"answer":5}' } }] },
  ]);
  function MathAgent() {
    this.use({
      sdk: openai, provider: "openai", model: "gpt-test", prompt: "You are a calculator.",
      schema: calculatorSchema,
      exitConditions: { functionCall: "finish", iterations: 5 },
    });
    this.add = async ({ a, b }) => ({ sum: a + b });
    this.finish = async ({ answer }) => ({ answer });
  }
  const output = await Agentci().rootAgent(MathAgent).invoke("what is 2+3?");
  return {
    exitedOnFinish: JSON.stringify(output) === '{"answer":5}',
    modelCalls: openai.captured.length,
    output,
    requestsSentToOpenai: openai.captured,
  };
}

export async function anthropicToolLoop() {
  const anthropic = mockAnthropic([
    { content: [{ type: "text", text: "on it" }, { type: "tool_use", id: "tu_1", name: "add", input: { a: 2, b: 3 } }], stop_reason: "tool_use" },
    { content: [{ type: "tool_use", id: "tu_2", name: "finish", input: { answer: 5 } }], stop_reason: "tool_use" },
  ]);
  function ClaudeAgent() {
    this.use({
      sdk: anthropic, provider: "anthropic", model: "claude-opus-5", prompt: "You are a calculator.",
      max_tokens: 2048,
      schema: calculatorSchema,
      exitConditions: { functionCall: "finish", iterations: 5 },
    });
    this.add = async ({ a, b }) => ({ sum: a + b });
    this.finish = async ({ answer }) => ({ answer });
  }
  const output = await Agentci().rootAgent(ClaudeAgent).invoke("what is 2+3?");
  return {
    exitedOnFinish: JSON.stringify(output) === '{"answer":5}',
    modelCalls: anthropic.captured.length,
    output,
    requestsSentToAnthropic: anthropic.captured,
  };
}

export async function providerSwitch() {
  const openai = mockOpenai([{ role: "assistant", content: "from openai" }]);
  const anthropic = mockAnthropic([{ content: [{ type: "text", text: "from claude" }], stop_reason: "end_turn" }]);
  function Switcher() {
    this.use({
      sdk: ({ state }) => (state.iterations === 0 ? openai : anthropic),
      provider: ({ state }) => (state.iterations === 0 ? "openai" : "anthropic"),
      model: "m", prompt: "p",
      exitConditions: { iterations: 2 },
    });
  }
  const output = await Agentci().rootAgent(Switcher).invoke("hi");
  return {
    output,
    openaiCalls: openai.captured.length,
    anthropicCalls: anthropic.captured.length,
    openaiRequest: openai.captured[0],
    anthropicRequest: anthropic.captured[0],
  };
}

export async function globalExitConditions() {
  const openai = mockOpenai([{ role: "assistant", content: "answer" }]);
  function Chatty() {
    this.use({ sdk: openai, provider: "openai", model: "m", prompt: "p" });
  }
  function GlobalConfig() {
    this.use({ exitConditions: { iterations: 1 } });
  }
  const output = await Agentci().config(GlobalConfig).rootAgent(Chatty).invoke("hi");
  return {
    output,
    modelCalls: openai.captured.length,
    toolsOmittedWhenSchemaEmpty: !("tools" in openai.captured[0]),
    requestSent: openai.captured[0],
  };
}

export async function falsyStateMerge() {
  const openai = mockOpenai([{ role: "assistant", content: "ok" }]);
  let stateSeenByMiddleware;
  function Falsy() {
    this.use({
      sdk: openai, provider: "openai", model: "m", prompt: "p",
      state: { count: 99, flag: "default" },
      exitConditions: { iterations: 1 },
    });
    this.before(async (data, next) => {
      stateSeenByMiddleware = { count: data.state.count, flag: data.state.flag };
      next();
    });
  }
  await Agentci().rootAgent(Falsy).invoke("x", { count: 0 });
  return {
    callerPassed: { count: 0 },
    agentDefaults: { count: 99, flag: "default" },
    stateSeenByMiddleware,
    callerFalsyValueSurvived: stateSeenByMiddleware.count === 0,
  };
}
