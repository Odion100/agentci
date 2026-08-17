# Framework — agentci's testing service

The agentci framework's live surface on the hub. Two kinds of modules: the framework's **real functions** passed straight in (probing them calls the exact code the execution loop uses), and **live Claude agents** mounted as modules.

## The framework, directly callable

- :ns[MessageFormat] — the shared message helpers every provider wrapper uses: `parseInput`, `normalizeMessages`, `deNormalizeMessages`
- :ns[Anthropic] — the Claude wrapper's converters: `convertMessages`, `convertRequest`, `convertResponse`, `toImageBlock`
- :ns[Schema] — `validateSchema`: tool-shape checks plus functionCall-exit reachability
- :ns[Loops] — execution-loop scenarios on mock SDKs (free, no API key): tool-loop exit, mid-run provider switching, global exit conditions, falsy state merge — plus the RFC modern-core round: strict outputs on both wires, streaming, sequential-vs-parallel tools, native-tool passthrough, and :ns[Loops.mcpToolLoop] driving a real stdio MCP server through the middleware chain

## Live Claude agents

Real agentci agents on `claude-opus-5`, each with its own doc and saved test at the method node:

- :ns[Calculator.invoke] — the tool loop: five-function schema, `functionCall` exit
- :ns[Summarizer.invoke] — the no-tools path: no schema, `shortCircuit` exit
- :ns[Team.invoke] — multi-agent: a Coordinator delegating to a Poet agent mid-loop

## Plumbing

- :ns[Tests] — service liveness (`health`, `echo`)
- Entry: ::file[service/index.cjs] — agents and framework functions pass into `.module()` as plain objects
- Suite: `systemview test agentci` runs every saved test in `service/specs/tests/`
