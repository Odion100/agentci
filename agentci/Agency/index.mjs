import createAgentModule from "../AgentModule/index.mjs";
import ConfigModule from "../ConfigModule/index.mjs";
function createAgentci() {
  const systemContext = { Agents: [], config: {} };
  const AgentModule = createAgentModule(systemContext);

  const Agentci = {};
  let rootModule = null;

  function createModule(__constructor) {
    typeof __constructor === "function" ? AgentModule(__constructor) : __constructor;
  }
  Agentci.agent = (name, __constructor) => {
    const agentModule = createModule(__constructor);
    if (!systemContext.Agents.length) rootModule = agentModule;
    systemContext.Agents.push({ name, module: agentModule });
    return { ...rootModule, agent: Agentci.agent, config: Agentci.config };
  };

  Agentci.rootAgent = (__constructor) => {
    rootModule = createModule(__constructor);
    systemContext.Agents.push({
      name: "$root",
      module: rootModule,
    });

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
