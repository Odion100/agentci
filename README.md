# Agentci

Agentci (Agent Control Interface) is a Javascript framework for building AI agents using a structured execution model. It provides a consistent interface for working with AI model APIs and organizing function calling, middleware, and execution flow.

Agentci abstracts model-specific implementations (OpenAI and Anthropic/Claude) and allows agents to be composed using functions and middleware. Conversation state is kept in one shared message format, so an agent can even switch providers mid-execution without losing history.

---

## Overview

An Agentci agent is defined as a function. Inside that function, you configure the model, assign callable functions to the agent, and attach middleware around execution.

An agent usually contains:

- Model configuration
- Prompt configuration
- Function calling schema
- Callable functions
- Middleware hooks
- Exit conditions
- (Shared) State used during execution

Execution starts by calling `.invoke()`.

```javascript
import Agentci from "agentci";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const agent = Agentci().rootAgent(function MyAgent() {
  this.use({
    provider: "openai",
    model: "gpt-4o",
    sdk: openai,
    prompt: "...",
    schema,
    exitConditions: { functionCall: "finish", iterations: 5 },
  });
  // define functions, middleware, etc.
});

const state = {};

const result = await agent.invoke("...", state);
```

---

## Quick Start

### Install

```bash
npm install agentci openai            # OpenAI models
npm install agentci @anthropic-ai/sdk # Claude models
```

---

### Providers

The `provider` option selects the wrapper; the `sdk` option is the provider's client instance, injected by you — Agentci has no SDK dependency of its own.

```javascript
// OpenAI
this.use({ provider: "openai", sdk: new OpenAI({ apiKey }), model: "gpt-4o", ... });

// Claude — "anthropic" and "claude" are the same wrapper
this.use({
  provider: "anthropic",
  sdk: new Anthropic({ apiKey }),
  model: "claude-opus-5",
  max_tokens: 2048, // Anthropic requires max_tokens; defaults to 4096 if unset
  ...
});
```

The same schema, functions, middleware, and exit conditions work on either provider. Internally every conversation is stored in one shared message format; each wrapper converts to its provider's wire format per request. Notes for Claude: tool schemas are converted to Anthropic's `input_schema` form automatically, tool results are batched per turn, and `temperature` should be left unset for the newest Claude models (they reject sampling parameters).

`provider` and `sdk` can also be functions of `({ state, input })` — evaluated every cycle — so an agent can switch providers mid-execution:

```javascript
this.use({
  provider: ({ state }) => (state.iterations === 0 ? "openai" : "anthropic"),
  sdk: ({ state }) => (state.iterations === 0 ? openai : anthropic),
  ...
});
```

`model`, `prompt`, `schema`, `temperature`, and `max_tokens` accept functions the same way.

---

### Configure an Agent

An agent is the main unit of execution. It defines how the model is configured and what functions the model can call.

```javascript
function MyAgent() {
  this.use({
    provider: "openai",
    model: "gpt-4o",
    sdk: openai,
    schema,
    prompt:'...'
  });
  ...
}
```

The `this.use()` method configures the agent. At minimum, it defines the required configuration for the agent to run, including the provider, model, SDK instance, as well as the prompt and schema used during execution.

---

### Add a Function

Functions assigned to `this` inside an agent module become callable by the model.

```javascript
function MyAgent() {
  this.use({
    provider: "openai",
    model: "gpt-4o",
    sdk: openai,
    schema,
    prompt:
      "You are a friendly assistant. When the user asks you to greet someone, call the sayHello function with that person's name.",
  });

  this.sayHello = function ({ name }) {
    return `Hello ${name}`;
  };
}
```

In this example, `sayHello` is a function the model can call. Agentci handles the model interaction and routes the function call to the matching function on the agent.

---

### Add Schema and Prompt

Function calling requires the model to know what functions are available and what arguments they accept. A schema can be passed into `this.use()` along with a prompt.

The prompt can be a string or a function. When a function is used, it receives the current agent state, allowing the prompt to be generated dynamically for each invocation.

```javascript
import Agentci from "agentci";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prompt = (state) =>
  `You are a helpful assistant. The user's name is ${state.name}. Respond to their request appropriately.`;

const schema = [
  {
    type: "function",
    function: {
      name: "sayHello",
      description: "Say hello to a user by name.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the user to greet.",
          },
        },
        required: ["name"],
      },
    },
  },
];

function MyAgent() {
  this.use({
    provider: "openai",
    model: "gpt-4o",
    sdk: openai,
    prompt,
    schema,
  });

  this.sayHello = function ({ name }) {
    return `Hello ${name}`;
  };
}

const agent = Agentci().rootAgent(MyAgent);
```

The schema describes the function to the model. The function assigned to `this.sayHello` contains the actual implementation.

In this example, the prompt function receives the agent state directly. Any values stored in state (such as `state.name`) can be used to dynamically construct the prompt for the model.

### Invoke

`.invoke()` starts the agent execution loop.

```javascript
const result = await agent.invoke("Say hello to John", state);
```

The first argument is the user input. The second argument is an optional state object that can be shared across the execution cycle.

```javascript
const state = { messages: [] };

const result = await agent.invoke("Say hello to John", state);
```

During invocation, Agentci sends the input to the configured model. The model can respond directly or call one of the functions exposed by the agent. The loop continues until an exit condition is met.

---

### Middleware

Middleware can run before or after a function is called.

```javascript
function MyAgent() {
  this.use({
    provider: "openai",
    model: "gpt-4o",
    sdk: openai,
    schema,
    prompt,
  });

  this.sayHello = function ({ name }) {
    return `Hello ${name}`;
  };

  this.before("sayHello", async function ({ args, state, agents }, next) {
    if (!args.name && state.lastName) {
      args.name = state.lastName;
    }

    const result = await agents.OtherAgent.invoke({
      message: "Resolve the missing name",
      input: args,
    });

    next();
  });

  this.after("sayHello", function ({ state }, next) {
    state.lastRun = Date.now();
    next();
  });
}
```

`before()` middleware runs before the target function. `after()` middleware runs after the target function.

Middleware is useful for cross-cutting behavior such as logging, validation, and state updates, as well as controlling execution flow. For example, aborting a function call or branching into other agents when needed.

If `next()` is not called, the function execution will not continue.

Middleware functions receive:

- `fn` → the name of the function (or hook) being wrapped
- `args` → the arguments provided by the model for the function call (mutable — changes here are what the function receives)
- `input` → the original user input passed to `invoke()`
- `state` → shared state across execution
- `agents` → a handle on other agents that can be invoked
- `next` → continues execution to the next step in the pipeline

### Special Middleware Hooks

Agentci includes special hook names for common execution lifecycle points.

```javascript
this.before("$all", fn);
this.after("$all", fn);
```

`$all` runs before or after any function call.

```javascript
this.before("$invoke", fn);
this.after("$invoke", fn);
```

`$invoke` runs before or after the model is invoked during an execution cycle. This runs once per cycle during `.invoke()`.

The difference is:

- `$invoke` wraps the model call
- `$all` wraps every function call
- Function-specific middleware wraps one named function

### Add Exit Conditions

Exit conditions control when the agent stops executing.

```javascript
this.use({
  exitConditions: {
    errors: 1,
    functionCall: "sayHello",
  },
});
```

In this example, the agent stops if one error occurs or after the `sayHello` function is called.

Exit conditions are configured inside `this.use()`.

---

## Exit Conditions

Exit conditions control when the invocation loop should stop. **At least one valid exit condition is required** — validated when `use()` receives `exitConditions`, and again at the first `invoke()` against the merged agent + global config set. An agent whose `functionCall` exit names functions missing from the schema (with no other condition as fallback) fails schema validation rather than looping forever.

```javascript
this.use({
  exitConditions: {
    errors: 1,
    functionCall: "sayHello",
  },
});
```

### iterations

Stops execution after the specified number of model calls — the hard ceiling most agents should set.

```javascript
exitConditions: {
  iterations: 5,
}
```

---

### errors

Stops execution after the specified number of errors.

```javascript
exitConditions: {
  errors: 1,
}
```

---

### functionCall

Stops execution when a specific function is called.

```javascript
exitConditions: {
  functionCall: "sayHello",
}
```

This check occurs after the function has been executed.

`functionCall` can also accept an array of function names.

```javascript
exitConditions: {
  functionCall: ["sayHello", "orAnotherFunction"],
}
```

---

### state

Stops execution based on the current state.

```javascript
exitConditions: {
  state: (state) => state.abort,
}
```

The `state` condition must return a boolean value (`true` to exit, `false` to continue). It can be defined as a function that receives the current state and determines whether execution should stop.

```javascript
exitConditions: {
  state: (state) => {
    return state.abort === true;
  },
}
```

This allows custom logic to determine when execution should stop.

---

### shortCircuit

Stops execution after the specified number of **consecutive model responses without a function call**. `shortCircuit: 1` makes a plain chat agent exit after its first text-only answer; a tool-calling response resets the count.

```javascript
exitConditions: {
  shortCircuit: 1,
}
```

---

### Execution Lifecycle

This is the order in which middleware and function execution occurs during an invocation cycle:

```text
invoke()
 → before("$invoke")
 → model invocation
 → before("$all")
 → before("functionName")
 → function execution
 → after("functionName")
 → after("$all")
 → after("$invoke")
 → repeat or exit
```

---

### Return Value

The value returned from `.invoke()` is the result of the last function call executed during the agent's lifecycle.

```javascript
const result = await agent.invoke("Say hello to John", state);
```

If the model calls a function, whatever that function returns will be returned from `.invoke()` once execution stops.

Middleware can also override the return value. Inside middleware, setting `return` on the middleware data object will define the final result:

```javascript
this.after("sayHello", function (mwData, next) {
  mwData.return = { message: "Overridden result" };
  next();
});
```

This is typically done in `after()` middleware, since the return value is determined after the function has executed.

---

## Multi-Agent Composition

Agentci can compose multiple agents.

```javascript
import Agentci from "agentci";

export default Agentci()
  .rootAgent(WebAssistant)
  .agent("ElementIdentifier", ElementIdentifier)
  .agent("ContainerIdentifier", ContainerIdentifier)
  .agent("VisualConfirmation", VisualConfirmation);
```

The root agent is the primary agent. Additional agents can be registered by name and used as supporting agents.

Each agent can define its own model configuration, schema, prompt, functions, middleware, and exit conditions.

---

## Configuration

Configuration can also be applied globally using `.config()`.

```javascript
export default Agentci()
  .rootAgent(WebAssistant)
  .agent("ElementIdentifier", ElementIdentifier)
  .config(function () {
    this.use({
      exitConditions: {
        errors: 1,
      },
    });
  });
```

This is useful for shared configuration that should apply across the Agentci instance.

Agent-specific settings take precedence over global config: an agent's own `model`, `prompt`, `provider`, `sdk`, `temperature`, or `max_tokens` wins over the same key set in `.config()`, and agent `exitConditions` override config values key by key.

---

## Agent Methods

The object returned by `Agentci().rootAgent(...)` (and by each `.agent()` chain) exposes:

- `invoke(input, state?)` → runs the execution loop; `input` is a string or `{ message, image?, images? }` (image paths are base64-encoded automatically). Returns the final output.
- `insertMessage(input)` → appends a user message to the conversation without invoking the model — useful for seeding history between invocations.
- `getNormalizedMessages(messages?)` → returns the conversation in a provider-neutral shape (`{ role, date, message, image?, images?, tool_calls? }`) for display or storage.

---

## Debugging

Set `AGENTCI_DEBUG=1` to log the execution loop's internals (middleware runs, function calls, model responses). Without it the loop is silent; real errors always print via `console.error`.

---
