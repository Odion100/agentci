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

export async function strictOutputs() {
  const strictParams = {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: { answer: { type: "number" } },
  };
  const openai = mockOpenai([{ role: "assistant", content: '{"answer":42}' }]);
  const anthropic = mockAnthropic([
    { content: [{ type: "text", text: '{"answer":42}' }], stop_reason: "end_turn" },
  ]);
  function StrictAgent() {
    this.use({
      sdk: ({ state }) => (state.iterations === 0 ? openai : anthropic),
      provider: ({ state }) => (state.iterations === 0 ? "openai" : "anthropic"),
      model: "m",
      prompt: "p",
      strict: true,
      responseSchema: { name: "answer", schema: strictParams },
      schema: [
        {
          type: "function",
          function: { name: "noop", description: "noop", parameters: strictParams },
        },
      ],
      exitConditions: { iterations: 2 },
    });
    this.noop = ({ answer }) => answer;
  }
  await Agentci().rootAgent(StrictAgent).invoke("answer");
  return {
    openaiWire: {
      strictOnFunctionDef: openai.captured[0].tools[0].function.strict === true,
      response_format: openai.captured[0].response_format,
    },
    anthropicWire: {
      strictOnToolDef: anthropic.captured[0].tools[0].strict === true,
      output_config: anthropic.captured[0].output_config,
    },
  };
}

export async function streamingLoop() {
  const tokens = [];
  const captured = [];
  const openai = {
    captured,
    chat: {
      completions: {
        create: async (payload) => {
          captured.push(JSON.parse(JSON.stringify(payload)));
          return (async function* () {
            for (const word of ["streamed", " token", " by", " token"]) {
              yield { choices: [{ delta: { content: word } }] };
            }
          })();
        },
      },
    },
  };
  function StreamAgent() {
    this.use({
      sdk: openai,
      provider: "openai",
      model: "m",
      prompt: "p",
      onToken: (token) => tokens.push(token),
      exitConditions: { shortCircuit: 1, iterations: 2 },
    });
  }
  const output = await Agentci().rootAgent(StreamAgent).invoke("go");
  return {
    output,
    tokensReceived: tokens,
    streamFlagSent: openai.captured[0].stream === true,
    finalMessageAssembled: output === "streamed token by token",
  };
}

export async function parallelToolsRace() {
  const twoCalls = {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "c1", type: "function", function: { name: "slow", arguments: "{}" } },
      { id: "c2", type: "function", function: { name: "quick", arguments: "{}" } },
    ],
  };
  const schema = [
    { type: "function", function: { name: "slow", description: "slow" } },
    { type: "function", function: { name: "quick", description: "quick" } },
  ];
  async function race(parallelTools) {
    const openai = mockOpenai([twoCalls, { role: "assistant", content: "done" }]);
    const order = [];
    function Racer() {
      this.use({
        sdk: openai,
        provider: "openai",
        model: "m",
        prompt: "p",
        parallelTools,
        schema,
        exitConditions: { shortCircuit: 1, iterations: 3 },
      });
      this.slow = async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        order.push("slow");
        return "slow done";
      };
      this.quick = async () => {
        order.push("quick");
        return "quick done";
      };
    }
    await Agentci().rootAgent(Racer).invoke("go");
    return order;
  }
  const sequentialOrder = await race(false);
  const parallelOrder = await race(true);
  return {
    sequentialOrder,
    parallelOrder,
    sequentialPreservesCallOrder: sequentialOrder.join(",") === "slow,quick",
    parallelLetsQuickWin: parallelOrder.join(",") === "quick,slow",
  };
}

export async function nativeToolPassthrough() {
  const computerTool = {
    type: "computer_20251124",
    name: "computer",
    display_width_px: 1920,
    display_height_px: 1080,
  };
  const anthropic = mockAnthropic([
    {
      content: [{ type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } }],
      stop_reason: "tool_use",
    },
    { content: [{ type: "text", text: "saw the screen" }], stop_reason: "end_turn" },
  ]);
  function ComputerAgent() {
    this.use({
      sdk: anthropic,
      provider: "anthropic",
      model: "claude-opus-5",
      prompt: "p",
      schema: [computerTool],
      exitConditions: { functionCall: "computer", iterations: 3 },
    });
    this.computer = async ({ action }) => `executed ${action}, screenshot attached`;
  }
  const output = await Agentci().rootAgent(ComputerAgent).invoke("look at the screen");
  return {
    output,
    nativeToolSentUntouched: anthropic.captured[0].tools[0],
    consumerExecutorRan: output === "executed screenshot, screenshot attached",
  };
}

export async function mcpToolLoop() {
  const openai = mockOpenai([
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "pw_echo", arguments: '{"text":"ping"}' } },
      ],
    },
    { role: "assistant", content: "done" },
  ]);
  const intercepted = [];
  const agency = Agentci().rootAgent(function McpAgent() {
    this.use({
      sdk: openai,
      provider: "openai",
      model: "m",
      prompt: "p",
      exitConditions: { functionCall: "pw_echo", iterations: 3 },
    });
    this.mcp(
      { command: process.execPath, args: [new URL("./mcpFixture.mjs", import.meta.url).pathname] },
      { prefix: "pw", transformResult: (name, text) => `[${name}] ${text}` }
    );
    this.before("pw_echo", (data, next) => {
      intercepted.push(data.args.text);
      data.args.text = "intercepted";
      next();
    });
  });
  const output = await agency.invoke("go");
  const toolsOfferedToModel = openai.captured[0].tools.map((tool) => tool.function.name);
  await agency.close();
  return {
    output,
    toolsOfferedToModel,
    middlewareSawOriginalArgs: intercepted[0] === "ping",
    middlewareRewroteArgs: output === "[echo] echo: intercepted",
    connectionClosed: true,
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
