# Summarizer.invoke

The no-tools path: input goes in, one plain Claude response comes back as a string. No schema means no tools are sent at all; `shortCircuit: 1` exits after the first response without a function call.

::::columns{split=19}
:::col
The whole agent is a prompt and two exit conditions:
:::
:::col
::file[service/agents.mjs#L48-L58]
:::
::::

## The saved test

::test[Summarizer.invoke]

## Try it

:::run{title="Summarize something"}
- Summarizer.invoke("SystemView lets agents and humans work in the same interactive documents, with tests, docs, and chat all hanging off the same service namespaces.")
:::
