import createAgentModule from "../AgentModule/index.mjs";
import ConfigModule from "../ConfigModule/index.mjs";
function createAgentci() {
  const systemContext = {
    Agents: [],
    connections: [],
    config: {
      sdk: undefined,
      model: "",
      prompt: "",
      provider: "",
      temperature: undefined,
      max_tokens: undefined,
      schema: [],
      exitConditions: {},
      middleware: {
        before: {},
        after: {},
      },
      agents: [],
    },
  };
  const AgentModule = createAgentModule(systemContext);

  const Agentci = {};
  let rootModule = null;

  function createModule(__constructor, name) {
    return typeof __constructor === "function"
      ? AgentModule(__constructor, name)
      : __constructor;
  }
  function chainReturn() {
    const surface = { ...rootModule };
    Object.defineProperties(surface, {
      agent: { value: Agentci.agent },
      config: { value: Agentci.config },
      build: { value: Agentci.build },
      close: { value: Agentci.close },
    });
    return surface;
  }

  Agentci.agent = (name, __constructor) => {
    const agentModule = createModule(__constructor, name);
    if (!systemContext.Agents.length) rootModule = agentModule;
    systemContext.Agents.push({ name, module: agentModule });
    return chainReturn();
  };

  Agentci.rootAgent = (__constructor) => {
    const name = __constructor.name || "$root";
    rootModule = createModule(__constructor, name);
    systemContext.Agents.push({
      name,
      module: rootModule,
    });
    return chainReturn();
  };

  Agentci.config = (__constructor) => {
    systemContext.config = ConfigModule(__constructor);
    return rootModule ? chainReturn() : Agentci;
  };

  Agentci.build = () => {
    if (!rootModule)
      throw Error(`[Agentci Error]: build() called before any agent was registered.`);
    const agents = systemContext.Agents.reduce((map, { name, module }) => {
      map[name] = module;
      return map;
    }, {});
    const surface = { ...rootModule, agents };
    Object.defineProperty(surface, "close", { value: Agentci.close });
    return surface;
  };

  Agentci.close = async () => {
    await Promise.all(systemContext.connections.map((connection) => connection.close()));
    systemContext.connections.length = 0;
  };

  return Agentci;
}

export default createAgentci;
