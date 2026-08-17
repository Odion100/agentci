# Summarizer

The no-tools path: a chat-only agentci agent on Claude. No schema, so no tools are sent; `exitConditions: { shortCircuit: 1 }` ends the loop after the first response without a function call. `invoke` returns the model's text.

::::columns{split=18}
:::col
The whole agent is a prompt and two exit conditions — the framework handles the rest:
:::
:::col
::file[service/agents.mjs#L48-L58]
:::
::::

## Saved test

::test[Summarizer.invoke]
