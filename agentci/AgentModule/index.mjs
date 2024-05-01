import EventEmitter from "events";
import sdkWrappers from "../utils/sdkWrappers.mjs";
import agentRequestHandler from "./utils/agentRequestHandler.mjs";

export default function createAgentModule(systemContext) {
  return function AgentModule(constructor) {
    if (
      typeof constructor != "function" ||
      constructor.constructor.name === "AsyncFunction"
    )
      throw `[Agentci Error]: AgentModule requires a synchronous function as a constructor`;

    const internalContext = {
      agents: [],
      exitConditions: { iterations: 0, errors: 0, functionCall: "finished" },
      middleware: {},
    };

    const Agent = new EventEmitter();

    Agent.use = (options) => {
      options.exitConditions = Object.assign(
        internalContext.exitConditions,
        options.exitConditions
      );
      Object.assign(internalContext, options);
    };

    Agent.before = (...args) => {
      if (typeof args[0] === "string") {
        const fn = args.shift();
        addMiddleware(`${fn}`, args, internalContext.middleware);
      } else {
        addMiddleware("$invoke", args, internalContext.middleware);
      }
    };

    constructor.apply(Agent, []);

    function getMiddleware() {
      const middleware = Object.assign({}, systemContext.config.middleware || {});
      for (prop in internalContext.middleware) {
        if (middleware[prop]) {
          middleware[prop].push(...internalContext.middleware[prop]);
        } else {
          middleware[prop] = internalContext.middleware[prop];
        }
      }
      return middleware;
    }
    function getSchemas() {
      const getSchema = ({ schema }) =>
        typeof schema === "function" ? schema(state) : schema;
      return [...getSchema(internalContext), ...getSchema(systemContext.config)];
    }

    let context = null;
    function invoke(input, state = {}) {
      if (!context) {
        const { config: conf } = systemContext;
        const exitConditions = Object.assign(
          {},
          conf.exitConditions,
          internalContext.exitConditions
        );
        const middleware = getMiddleware();
        const agentList = [...conf.agents, ...internalContext.agents];
        const agents = systemContext.Agents.reduce(({ name, module }, results) => {
          if (agentList.includes(name)) results[name] = module;
          return results;
        }, {});
        context = {
          sdk: conf.sdk || internalContext.sdk,
          model: conf.model || internalContext.model,
          prompt: conf.prompt || internalContext.prompt,
          provider: conf.provider || internalContext.provider,
          temperature: conf.temperature || internalContext.temperature,
          max_tokens: conf.max_tokens || internalContext.max_tokens,
          schema: getSchemas,
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
        context.llm.validateSchema(schema, context.exitConditions);
      }

      const agent = { ...systemContext.config.Agent, ...Agent };
      if (!state.message) state.message = [];
      return agentRequestHandler(agent, context, input, state);
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
