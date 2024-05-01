# Agentci

Agentci is the Javascript framework for developing ai agents. Agentci stands for **Agent Control Interface**. Here how you get started.

```
npm install agentci
```

## A Control Interface for AI Agents

## Agentci

- `Agentci().agent(name, constructor)`:

- `Agentci().rootAgent(constructor)`:

- `Agentci().config(constructor)`:

## AgentModule

## ConfigModule

## RootAgent

### todo

- save a map of before middlewares to methods

- Also call any before invoke middlewares before invocation

- pass systemContext in to createAgentModule method

- create event dispatcher

- import AgentModule and construct the agents in Agency file

- set this.req value during invocation

- use reduce to create a wrapper around each method
  so that we can use apply to set the this value with
  additional data

- get the agents (from this.use({agents})) value before calling a method

- make sure the messages are added to the this.req for the middleware

- pass the invoke arguments into the functions when calling them

- consider exit conditions

- include assistant message and tool message

- update the state

- finish function is required and will be added if not included
