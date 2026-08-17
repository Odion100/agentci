# Loops — execution-loop scenarios

Real framework code driven through mock SDKs (no API key, free to run). Each method builds an agent with `Agentci()`, runs a scripted model conversation through the actual execution loop, and returns the captured wire requests plus boolean verdicts — so a probe shows exactly what the loop sent to each provider.

## Original scenarios

- **openaiToolLoop / anthropicToolLoop** — full tool loop to a `functionCall` exit on each provider
- **providerSwitch** — provider/sdk as functions of state; mid-run OpenAI → Anthropic switch
- **globalExitConditions** — config-level exit conditions; `tools` omitted when schema is empty
- **falsyStateMerge** — caller-passed falsy state values survive the merge

## RFC modern-core scenarios (2026-08-17)

- **strictOutputs** — `strict: true` + `responseSchema` reach both wires in each provider's own shape (`function.strict` + `response_format` for OpenAI; top-level `strict` + `output_config` for Anthropic)
- **streamingLoop** — `onToken` callback receives tokens; the loop consumes the assembled final message
- **parallelToolsRace** — sequential execution is the default; `parallelTools: true` opts into concurrent execution of one response's calls
- **nativeToolPassthrough** — a `computer_20251124` tool passes to the wire untouched; the consumer's executor method handles the action
- **mcpToolLoop** — `this.mcp()` spawns a real stdio MCP server (`service/mcpFixture.mjs`), registers prefixed proxy methods, and named `before` middleware intercepts and rewrites the MCP tool's args

Saved suites: `Loops.anthropicToolLoop.json` (original), `Loops.mcpToolLoop.json` (RFC round).
