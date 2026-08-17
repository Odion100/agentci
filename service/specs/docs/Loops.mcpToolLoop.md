# Loops.mcpToolLoop

The end-to-end proof of the RFC's central claim: **MCP tools are indistinguishable from local functions to the middleware chain.**

## What it does

1. Builds an agent that calls `this.mcp()` with a real stdio server spec — `service/mcpFixture.mjs`, a genuine MCP server (built on `@modelcontextprotocol/sdk`) exposing `echo` and `shout` tools:

```js
this.mcp(
  { command: process.execPath, args: ["service/mcpFixture.mjs"] },
  { prefix: "pw", transformResult: (name, text) => `[${name}] ${text}` }
);
this.before("pw_echo", (data, next) => {
  data.args.text = "intercepted";   // middleware rewrites the model's args
  next();
});
```

2. At first invoke the framework connects, lists the server's tools, and registers `pw_echo`/`pw_shout` as proxy methods with their schemas merged into the agent's tool surface.
3. A mock OpenAI SDK scripts the model calling `pw_echo` with `{"text":"ping"}`.
4. The named `before` middleware sees the original args and rewrites them — proving arg mutation works on MCP tools exactly as on local functions.
5. The MCP server's response flows back through `transformResult`, and the run exits on `functionCall: "pw_echo"`.

## What the result proves

| field | proves |
|---|---|
| `output: "[echo] echo: intercepted"` | proxy called the real server with middleware-rewritten args, `transformResult` wrapped the response |
| `toolsOfferedToModel: ["pw_echo","pw_shout"]` | listed tools were prefixed and offered to the model as schema |
| `middlewareSawOriginalArgs` | named middleware ran before the MCP call with the model's original args |
| `connectionClosed` | `agency.close()` drained the connection (per-Agency lifecycle) |

The `{ prefix }` option namespaces the server's tools; an unprefixed name collision with an existing method hard-errors at registration. An optional `{ tools: [...] }` allowlist filters which server tools get registered.
