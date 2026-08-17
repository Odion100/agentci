# Team

Multi-agent composition, live: a Coordinator agent whose `askPoet` tool invokes a second agent (`agents.Poet.invoke`) mid-loop, then delivers the poem via `finish`. One `Team.invoke` call = two Claude agents cooperating.

::::columns{split=45}
:::col
The Coordinator — `askPoet` receives the shared `agents` map as its second argument and awaits the Poet's own invoke:
:::
:::col
::file[service/agents.mjs#L71-L87]
:::
::::

::::columns{split=45}
:::col
The Poet it delegates to — a plain chat agent registered with `.agent("Poet", PoetAgent)`:
:::
:::col
::file[service/agents.mjs#L60-L69]
:::
::::

## Saved test

::test[Team.invoke]
