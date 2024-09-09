import EventEmitter from "events";

export default function ConfigModule(constructor) {
  if (
    typeof constructor != "function" ||
    constructor.constructor.name === "AsyncFunction"
  )
    throw `[Agentci Error]: AgentModule requires a synchronous function as a constructor`;

  const internalContext = {
    agents: [],
    exitConditions: { iterations: 0, errors: 0, functionCall: [] },
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
        options.exitConditions.functionCall = [];
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

  return { ...internalContext, Agent };
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
