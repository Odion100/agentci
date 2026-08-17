# Team.invoke

One call, two Claude agents: the Coordinator's `askPoet` tool awaits `agents.Poet.invoke` mid-loop, then `finish` delivers the Poet's work back to you.

::::columns{split=45}
:::col
The Coordinator's schema is just two tools — `askPoet` and `finish`. Delegation is nothing more than a tool whose implementation happens to invoke another agent:
:::
:::col
::file[service/agents.mjs#L79-L82]
:::
::::

::::columns{split=45}
:::col
The Coordinator — `askPoet` gets the shared `agents` map as its second argument and delegates:
:::
:::col
::file[service/agents.mjs#L71-L87]
:::
::::

::::columns{split=45}
:::col
The Poet it calls — a plain chat agent registered with `.agent("Poet", PoetAgent)`:
:::
:::col
::file[service/agents.mjs#L60-L69]
:::
::::

## The saved test

::test[Team.invoke]

## Try it

:::run{title="Ask the Team"}
- Team.invoke("a two-line poem about tests that pass on the first try")
:::
