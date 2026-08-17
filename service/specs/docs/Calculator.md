# Calculator

A real agentci agent on the Claude provider (`claude-opus-5`), mounted as a service module — `invoke` is a live agentic loop: Claude receives the arithmetic tools, calls them for every operation, and exits by calling `finish`.

::::columns{split=45}
:::col
The agent definition — tools are plain methods on `this`, the schema tells Claude how to call them, and `exitConditions: { functionCall: "finish" }` ends the loop the moment the answer lands:
:::
:::col
::file[service/agents.mjs#L21-L46]
:::
::::

## Saved test

::test[Calculator.invoke]

## Try it on the fly

:::run{title="Ask it something new"}
- Calculator.invoke("what is 15 divided by 3, plus 100?")
  - results.answer = 105
:::
