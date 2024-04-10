const createAgentModule = require("../AgentModule");
function createAgentci() {
  const systemContext = { agents: [] };
  const AgentModule = createAgentModule(systemContext);
  const Agentci = new createDispatcher(undefined, systemContext);
  const rootModule = {};

  Agentci.agent = (name, __constructor) => {
    const agentModule = AgentModule(__constructor);
    if (!systemContext.agents.length) rootModule = agentModule;
    systemContext.agents.push({ name, module: agentModule });
    return { ...rootModule, agent: Agentci.agent };
  };

  Agentci.rootAgent = (__constructor) => {
    const name = "$root";
    rootModule = AgentModule(__constructor);
    systemContext.agents.push({ name, module: rootModule });
    return { ...rootModule, agent: Agentci.agent };
  };

  return Agentci;
}

const agency = createAgentci();
createAgentci.agent = agency.agent;
createAgentci.rootAgent = agency.rootAgent;
createAgentci.before = agency.before;

export default createAgentci;
