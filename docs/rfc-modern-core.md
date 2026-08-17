# RFC: agentci — the trimmed, modern core

**Status:** DRAFT — joint plan between agentci and autobot, for Odion to read and react to.
**Non-negotiable (Odion):** middleware injection — `before`/`after` on functions plus `$invoke`/`$all` is why agency exists at all.

This is the plan for what the next agentci actually is: what stays because it's the identity, what gets replaced underneath, what gets added, and what gets deleted. autobot is the framework's biggest consumer and co-author here; open questions carry an owner. Landscape context: autobot's researched delta at `~/autobot/.systemview/report.autobot.agent-landscape-2026.md` (strict outputs, MCP standardization, native computer use, AX-tree browser tooling).

---

## 1. What stays — the identity

These are the reasons to use agentci over a raw SDK, and they survive untouched:

### The constructor + `this.use` API

```js
function MyAgent() {
  this.use({
    provider: "anthropic",
    sdk: anthropicClient,
    model: "claude-opus-5",
    prompt: "You are...",
    exitConditions: { functionCall: "finish", iterations: 6 },
    schema: [...],
  });

  this.search = async function (args, { agents, state }) { ... };
  this.finish = function ({ answer }) { return answer; };
}
```

Methods on `this` become model-callable tools. Config is declarative. Nothing about this changes.

### Middleware injection

`this.before(name, fn)` / `this.after(name, fn)` at three granularities — `$invoke` (wraps the whole run), `$all` (every model cycle), and per-function. The middleware data object keeps its full power: mutable `args` (rewrite what the model asked for before the function sees it), `state`, `agents`, and `mwData.return` (override the run's output from anywhere). Not calling `next()` still halts the chain and skips the function.

This is the layer SDK tool runners don't have, and the reason the loop stays ours (§2).

### exitConditions

`iterations`, `errors`, `functionCall`, `shortCircuit`, `state` — declarative loop termination, validated at `use()` and at first invoke, with functionCall-exit reachability checked against the schema. Unchanged.

### The Agency container

`Agentci().rootAgent(Fn).agent(name, Fn).config(Fn)` — shared `systemContext`, the `agents` map handed to every function and middleware, config-vs-agent precedence (specific beats general). Unchanged, except the return-shape fix in §4.

### Dynamic values

`provider`, `sdk`, `model`, `prompt`, `schema` may each be a function of `({ state, input })`, re-evaluated every iteration. Combined with the OpenAI-shaped internal message format, this is what makes **mid-run provider switching** work — a capability none of the vendor runners offer, and one we keep.

---

## 2. The loop stays hand-rolled — here's the argument

autobot's opening position was to replace the hand-rolled request loop with a vendor SDK runner core. Rejected, with reasons:

1. **The hook surface doesn't map.** Per-function `before`/`after` with mutable args, `$all` per-cycle hooks, `mwData.return`, halt-by-not-calling-`next()` — vendor runners expose per-turn callbacks at best. We'd be rebuilding our middleware semantics *on top of* a runner, which is more code than the loop itself.
2. **Two providers means two runners.** OpenAI's and Anthropic's runners have different loop semantics, hook shapes, and failure behavior. One agentci API on two runner substrates is two behavior profiles. The current design — one loop, thin per-provider wrappers that convert at the wire — is exactly one behavior profile.
3. **Mid-run provider switching dies on a runner.** A runner owns its message history in its vendor's format. Our loop owns `state.messages` in one neutral (OpenAI-shaped) format and converts per request — that's the seam that lets `provider` be a function of state.
4. **The loop is small and audited.** Post-audit (2026-08-16) it's a few hundred lines, live-tested against both providers, with real schema validation and debug gating.

What the runners have that we actually want — **retries/backoff, streaming, strict outputs** — are *wrapper* concerns, and §3 takes them there. The loop's job is orchestration semantics; the wrappers' job is wire fidelity. Keep the split.

---

## 3. What the wrappers grow

All additive, all inside `agentci/utils/sdkWrappers/`, zero loop-semantics changes.

### 3.1 Strict structured outputs

Wire shapes verified by autobot against the current API references (2026-08-17):

- Tool schemas: pass `strict: true` through. **Anthropic** (GA, no beta): `strict: true` is a top-level field on the tool definition beside `name`/`description`/`input_schema`; requires `additionalProperties: false` and a full `required` list — guarantees `tool_use.input` validates exactly. **OpenAI**: `strict: true` on the function definition (constrained decoding). `validateSchema` already polices shape; strict mode makes the *provider* police argument JSON, deleting malformed-args retry middleware in consumers (autobot's single biggest deletion).
- Response shape: a new `responseSchema` option on `this.use`. **Anthropic**: `output_config: {format: {type: "json_schema", schema}}` — note `output_config`, not OpenAI's name, and the old top-level `output_format` is deprecated. **OpenAI**: `response_format: {type: "json_schema", json_schema: {name, strict: true, schema}}`. The invoke result is then parsed/validated output, not prose to regex.
- `validateSchema` grows a strict-mode preflight mirroring Anthropic's documented limits: no recursive schemas, no numeric/string min/max constraints, `additionalProperties: false` on every object.

### 3.2 Streaming

Wrapper-level `onToken` (or `stream: handler`) option. The loop only ever consumes the final assembled message, so streaming is pure wrapper plumbing — both SDKs have final-message helpers. No loop change.

### 3.3 Retries/backoff

Transport-level retry policy in the wrappers (429/5xx/overloaded), configurable via `this.use({ retries })`. The `errors` exitCondition remains the semantic error budget; wrapper retries are invisible below it.

### 3.4 Provider-native tool passthrough (computer use, web search, etc.)

Today wrappers translate *function* schemas only. Add a passthrough lane: schema entries typed as provider-native tools (`computer_*`, `web_search_*`, code execution) go to the wire untouched, and their results land in `state.messages` as tool results like any other. This is what lets autobot delete its vision-choreography middleware: screenshot/click orchestration becomes provider capability, while agentci middleware still wraps every action.

Verified shapes: **Anthropic** computer use (beta) is tool `{type: "computer_20251124", name: "computer", display_width_px, display_height_px}` plus header `anthropic-beta: computer-use-2025-11-24`; the model emits click/type/screenshot actions as `tool_use`, the consumer executes and returns screenshots as `tool_result` (1080p is the recommended cost/perf balance). **OpenAI** computer use (`computer_use_preview`) lives on the **Responses API**, not chat completions — a passthrough there implies a second endpoint lane in the openai wrapper (`computer_call` → `computer_call_output`), which is scoped as its own work item, not smuggled into this one.

Per autobot's landscape delta: AX-tree tooling (Playwright MCP, §4.1) is the primary browser path — snapshots with stable refs, no vision call; native computer use covers canvas apps, desktop control, and broken-accessibility sites. autobot's vision choreography (container/element identifiers, threshold retrieval) dies to the combination, not to computer use alone.

### 3.5 Parallel tool calls — sequential by default (RESOLVED, autobot endorses)

Two separate knobs, and the design keeps them separate:

- **Model-side emission** stays parallel — both providers emit multiple `toolCalls` per response by default (Anthropic exposes `disable_parallel_tool_use: true` inside `tool_choice` if a consumer ever wants it off).
- **Loop-side execution** stays sequential — per-function middleware ordering and shared-state mutation are semantics consumers rely on, and browser automation serializes by nature (a click invalidates the page). autobot's fan-out belongs at the Agency/multi-agent level, not the tool level. `parallelTools: true` remains available as an opt-in `Promise.all` across one response's calls, each still wrapped in its own before/after chain.
- **Invariant (already satisfied, now stated):** all tool results from one response return to the model in **one** user message — splitting them across messages silently trains Claude to stop making parallel calls. The anthropic wrapper already batches consecutive tool results into a single `tool_result`-blocks message; this is a contract, not an implementation detail.

---

## 4. New seams

### 4.1 `this.mcp(serverSpec)` — MCP tools through the same middleware chain

The construction layer is the seam; the loop never learns MCP exists:

```js
function BrowserAgent() {
  this.use({ ... });
  this.mcp({ command: "npx", args: ["@playwright/mcp"] });
  this.summarize = function ({ text }) { ... };  // local fns coexist
}
```

`this.mcp` connects at first invoke, lists the server's tools, merges their schemas into the agent schema, and registers **proxy methods on the agent** that forward to the MCP client. To `callFunctions` they're indistinguishable from local functions — so `$all` and named `before`/`after` middleware, arg mutation, `mwData.return`, and `functionCall` exits all apply to MCP tools with zero new machinery. That's the requirement ("MCP tools flowing through the same middleware chain") falling out of the existing design rather than being built beside it.

**Client-side is a deliberate choice.** Anthropic also ships a server-side MCP connector (`mcp_servers` + `mcp_toolset`, beta `mcp-client-2025-11-20`) where tool calls execute on Anthropic's infrastructure — those never reach `callFunctions`, so middleware cannot wrap them. That breaks the one non-negotiable, so client-side `this.mcp()` is the design; the server connector is noted as a possible future opt-in lane for tools a consumer explicitly doesn't need middleware on.

**Lifecycle and collisions (RESOLVED, autobot's proposal adopted):**

- **Connection scope: per Agency instance, not per invoke.** MCP servers are stateful processes — Playwright's browser *is* the state (login sessions, open tabs); per-invoke would cold-start a browser every call. Open lazily at first invoke, keep alive across invokes, close on an explicit `agency.close()` plus process-exit hooks.
- **Schema refresh at invoke boundaries only.** On a mid-invoke transport drop: one reconnect + re-list, but a changed tool list must not mutate the agent schema mid-run — the model's tool surface staying stable within a run is the same invariant the prompt-cache story depends on. Dynamic schema functions already re-evaluate per iteration; MCP refresh aligns to invoke start instead.
- **Name collisions: hard error at registration** — consistent with the exitConditions philosophy of failing loudly at construction. Escape hatch: `this.mcp(spec, { prefix: "pw" })` → `pw_click` etc. Auto-prefixing on collision would silently change the tool names the model sees; error + opt-in prefix is predictable. Same rule across multiple servers on one agent.

### 4.2 `.build()` — kill the asModule wart

`rootAgent()`/`agent()` return the agent module spread with the builder methods, so consumers must destructure (`asModule` in `service/agents.mjs`). Fix, two parts:

- `.build()` terminal on the chain returning bare agent surfaces: root agent's surface plus a named map — `{ invoke, insertMessage, getNormalizedMessages, agents: { Poet: {...} } }`. autobot confirmed from real mounting experience that this shape drops straight into SystemLynx `.module()`.
- Builder methods (`agent`, `config`) become non-enumerable on the chaining return, so existing spread-based mounting stops leaking them even without `.build()`.
- **Deliberate choice, stated so nobody "fixes" it later:** mounting an agent as a service module exposes `insertMessage`/`getNormalizedMessages` as wire-callable RPC. That is intentional — it's what makes test seeding and message inspection possible from saved tests and probes.

### 4.3 What gets deleted (autobot's autopsy, 2026-08-17)

- **In-framework:** nothing left on the list — the dead code (Dispatcher, default-zero exitConditions, console noise) already went in the 2026-08-16 audit.
- **Consumer-side, dies to strict outputs (§3.1):** malformed-JSON retry middleware.
- **Consumer-side, dies to AX-tree grounding (§4.1):** everything that existed to compensate for a model that couldn't point — autobot's `selectContainers`/`searchPage` middleware pair, the vision-description module chain (ContainerIdentifier, ElementIdentifier, ElementLocator, RefineSearch, CompareDescriptions), element-level vector retrieval with its 0.35/+0.05 thresholds, and container/section overlays *as a grounding mechanism*. Per-load AX refs solve element identity deterministically.
- **Survives, re-aimed:** the before/after idiom itself — it stops wrapping vision choreography and starts wrapping Playwright tool calls with real guardrail work: domain allowlists, destructive-action gates, navigation settling, screenshot-on-failure. That is the middleware Odion keeps, doing its actual job instead of model-limitation triage.

### 4.4 Plugins — how future integrations arrive (Odion, 2026-08-17)

Protocol integrations beyond MCP do **not** get their own methods on the agent interface. They arrive as **plugins on the Agentci interface** — separation of concerns: the core stays protocol-free, the plugin package owns the protocol.

```js
Agentci()
  .plugin(systemlynxPlugin)   // the plugin contributes abilities
  .rootAgent(Assistant);

// inside an agent constructor, abilities the plugin unlocked:
this.loadService("http://localhost:4400/buapp/api");  // remote SystemLynx service → agent tools
```

The first target is SystemLynx: `loadService`/`loadAgent` map a service's connectionData (already a tool manifest — service/module/method + routes) to proxy functions, with tool descriptions pulled from SystemView's per-namespace specs/docs. Under the hood a plugin feeds tools through the **same adapter contract** the seam already speaks — `connect() → { tools: [{name, description, inputSchema}], callTool, close }` — so loaded services get middleware, prefix/allowlist, collisions, and per-Agency lifecycle identically to MCP tools and local functions. (`this.mcp` stays a core method because MCP is the protocol-neutral standard; everything vendor- or ecosystem-specific comes in as a plugin.) Longer-run note (autobot): a thin SystemLynx→MCP bridge would expose the whole service ecosystem to any MCP client.

### 4.5 Memory converges into skills

One line with a lot behind it: autobot's element-selector memory store dies as-is, but the instinct behind it — *don't re-see what you've already learned* — was right, aimed one level too low. Its replacement is a skill/workflow library keyed by site + task ("how to do an advanced eBay search"), which is exactly what autobot's stubbed Jobs system (`executeJob`) wants to execute — so the memory system and the Jobs system converge into one thing, and the recorder + overlays survive as the *product surface* that seeds skills from human demonstrations. This is the part of the plan where the original architecture's idea graduates rather than gets deleted.

---

## 5. Explicitly out of scope

- TypeScript. The repo is plain-JS ESM by decision.
- A vendor-runner core (§2).
- Changing the internal message format — OpenAI-shaped `state.messages` stays, as the provider-switching seam.

---

## 6. Open questions ledger

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | 2026 wire shapes for strict outputs per provider | autobot | ✅ answered — folded into §3.1 |
| 2 | Sequential-by-default tool calls — acceptable for Playwright flows? | autobot | ✅ endorsed — §3.5 |
| 3 | Which middleware dies to AX-tree vs. stays; computer-use lane | autobot | ✅ autopsy folded — §4.3 |
| 4 | MCP connection lifecycle + tool name-collision policy | joint | ✅ resolved — §4.1 (per-Agency scope, invoke-boundary refresh, hard-error collisions + opt-in prefix) |
| 5 | `.build()` shape — does the surface map match SystemLynx mounting needs? | agentci | ✅ endorsed by autobot from real mounting — §4.2 |
| 6 | OpenAI Responses API lane — inherits BOTH computer-use and a *different* structured-output shape (text.format-style, exact param unverified); scope the two together as one work item | joint | open — deferred |

**Consumer sign-off:** autobot, 2026-08-17, after full review — "§2's rejection of my runner-core position is honest and correct; no structural objections."
