import createAgentModule from "../AgentModule/index.mjs";
import ConfigModule from "../ConfigModule/index.mjs";
function createAgentci() {
  const systemContext = {
    Agents: [],
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
  Agentci.agent = (name, __constructor) => {
    const agentModule = createModule(__constructor, name);
    if (!systemContext.Agents.length) rootModule = agentModule;
    systemContext.Agents.push({ name, module: agentModule });
    return { ...rootModule, agent: Agentci.agent, config: Agentci.config };
  };

  Agentci.rootAgent = (__constructor) => {
    const name = __constructor.name || "$root";
    rootModule = createModule(__constructor, name);
    systemContext.Agents.push({
      name,
      module: rootModule,
    });
    // console.log("rootModule-->", rootModule);
    return { ...rootModule, agent: Agentci.agent, config: Agentci.config };
  };

  Agentci.config = (__constructor) => {
    systemContext.config = ConfigModule(__constructor);
    return rootModule
      ? { ...rootModule, agent: Agentci.agent, config: Agentci.config }
      : Agentci;
  };

  return Agentci;
}

export default createAgentci;
