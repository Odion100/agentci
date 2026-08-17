# Calculator.invoke

Runs the agent's full loop against live Claude: your input becomes the user message, Claude calls the arithmetic tools (real `tool_use` round trips — the prompt forbids mental math), and the loop exits when it calls `finish`. Returns `{ answer }`.

::::columns{split=45}
:::col
The schema is what makes this a tool agent — these five entries are exactly what Claude sees as callable tools (stored OpenAI-shaped; the anthropic wrapper converts each to `input_schema` on the way out, and `validateSchema` checks the shape plus that the `finish` exit is reachable):
:::
:::col
::file[service/agents.mjs#L29-L35]
:::
::::

::::columns{split=45}
:::col
The agent behind this method — the tools are plain methods on `this`, and `exitConditions: { functionCall: "finish" }` is what ends the loop:
:::
:::col
::file[service/agents.mjs#L21-L46]
:::
::::

## The saved test

Asserts the whole chain: `(7 × 6) − 12` → tool calls → `results.answer = 30`.

::test[Calculator.invoke]

## Ask it something new

:::run{title="Fresh question"}
- Calculator.invoke("what is 15 divided by 3, plus 100?")
  - results.answer = 105
:::
