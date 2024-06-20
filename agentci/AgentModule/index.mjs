import EventEmitter from "events";
import sdkWrappers from "../utils/sdkWrappers.mjs";
import agentRequestHandler from "./utils/agentRequestHandler.mjs";

export default function createAgentModule(systemContext) {
  return function AgentModule(constructor, name) {
    if (
      typeof constructor != "function" ||
      constructor.constructor.name === "AsyncFunction"
    )
      throw `[Agentci Error]: AgentModule requires a synchronous function as a constructor`;

    const internalContext = {
      agents: [],
      exitConditions: { iterations: 0, errors: 0, functionCall: ["finished"] },
      middleware: {
        before: {},
        after: {},
      },
    };
    let state = {};
    const emitter = new EventEmitter();
    const Agent = {};
    Agent.on = emitter.on;
    Agent.once = emitter.once;
    Agent.emit = function (name, ...args) {
      args.push(state);
      emitter.emit(name, ...args);
    };
    const reservedKeys = ["use", "before", "after"];
    Agent.use = (options) => {
      if (options.exitConditions) {
        if (typeof options.exitConditions.functionCall === "string") {
          options.exitConditions.functionCall = [options.exitConditions.functionCall];
        } else if (!Array.isArray(options.exitConditions.functionCall)) {
          options.exitConditions.functionCall = ["finished"];
        }
        if (options.exitConditions.functionCall.includes("$all")) {
          const i = options.exitConditions.functionCall.indexOf("$all");
          const methods = Object.keys(Agent).filter((key) => !reservedKeys.includes(key));
          options.exitConditions.functionCall.splice(i, 1, ...methods);
        }
      }
      options.exitConditions = Object.assign(
        internalContext.exitConditions,
        options.exitConditions
      );
      Object.assign(internalContext, options);
    };

    Agent.before = (...args) => {
      if (typeof args[0] === "string") {
        const fn = args.shift();
        addMiddleware(`${fn}`, args, internalContext.middleware.before);
      } else {
        addMiddleware("$invoke", args, internalContext.middleware.before);
      }
    };
    Agent.after = (...args) => {
      if (typeof args[0] === "string") {
        const fn = args.shift();
        addMiddleware(`${fn}`, args, internalContext.middleware.after);
      } else {
        addMiddleware("$invoke", args, internalContext.middleware.after);
      }
    };

    constructor.apply(Agent, []);

    function getMiddleware() {
      const before = Object.assign({}, systemContext.config.middleware.before);
      for (const prop in internalContext.middleware.before) {
        if (before[prop]) {
          before[prop].push(...internalContext.middleware.before[prop]);
        } else {
          before[prop] = internalContext.middleware.before[prop];
        }
      }
      const after = Object.assign({}, systemContext.config.middleware.after);
      for (const prop in internalContext.middleware.after) {
        if (after[prop]) {
          after[prop].push(...internalContext.middleware.after[prop]);
        } else {
          after[prop] = internalContext.middleware.after[prop];
        }
      }
      return { before, after };
    }
    function mergeStates(newState) {
      //rules: 1. the ref to the newState object that is passed in should not be lost
      //2. the values applied to new state should not be overwritten
      //3. the internal state takes precedence over the config state
      const initialInternalState = internalContext.state || {};
      const initialConfigState = systemContext.config.state || {};
      for (const state of [initialInternalState, initialConfigState]) {
        for (const prop in state) {
          if (!newState[prop]) newState[prop] = state[prop];
        }
      }
      return newState;
    }
    let context = null;
    function invoke(input, inputState = {}) {
      state = mergeStates(inputState);
      if (!context) {
        const { config: conf } = systemContext;
        const exitConditions = Object.assign(
          {},
          conf.exitConditions,
          internalContext.exitConditions
        );
        const middleware = getMiddleware();
        const agentList = [...conf.agents, ...internalContext.agents];
        const agents = systemContext.Agents.reduce((results, { name, module }) => {
          if (agentList.includes(name)) results[name] = module;
          return results;
        }, {});
        // console.log("agents", agents);
        // throw agentList;
        context = {
          name,
          sdk: conf.sdk || internalContext.sdk,
          model: conf.model || internalContext.model,
          prompt: conf.prompt || internalContext.prompt,
          provider: conf.provider || internalContext.provider,
          temperature: conf.temperature || internalContext.temperature,
          max_tokens: conf.max_tokens || internalContext.max_tokens,
          schemas: { default: conf.schema, internal: internalContext.schema },
          exitConditions,
          middleware,
          agents,
        };
        const { sdk, model, prompt, provider } = context;
        for (const prop in { sdk, model, prompt, provider }) {
          if (!context[prop])
            throw Error(`[Agentci Error]: required agent context ${prop}`);
        }
        if (!sdkWrappers[provider])
          throw Error(`[Agentci Error]: ${provider} is not a supported provider.`);

        context.llm = sdkWrappers[provider](sdk);
      }

      const agent = { ...systemContext.config.Agent, ...Agent };
      if (!state.messages) state.messages = [];
      const userInput = typeof input === "string" ? { message: input } : input;
      return agentRequestHandler(agent, context, userInput, state);
    }
    return { invoke };
  };
}
function addMiddleware(name, mwList, middlewareMap) {
  mwList.forEach(async (middleware) => {
    if (Array.isArray(middleware)) {
      middleware.map(addMiddleware);
    } else {
      addMiddleware(middleware);
    }
  });

  function addMiddleware(middleware) {
    if (Array.isArray(middleware)) return middleware.map(addMiddleware);
    if (!middlewareMap[name]) middlewareMap[name] = [];
    middlewareMap[name].push(middleware);
  }
}
