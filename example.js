function BrowserAgent() {
  this.requireAgents(["Questioner"]);
  this.useModel();
}
const agentci = () => {};
const agency = new agentci();

//const rootAgent = agentci.rootAgent(root).agent("BrowserAgent", BrowserAgent);

function BrowserAgent() {
  this.use({
    prompt,
    state,
    llm,
    model,
    agents: ["Questioner"],
  });
  this.navigate = function () {
    const Questioner = this.Questioner;
    if (true) {
      Questioner.invoke();
    }
    // open
  };

  this.click = function () {
    //
  };
}
Client.use(agentci);
const BU = Client.loadAgent(url);

const BrowserTeam = agentci()
  .agent("BrowserAgent", BrowserAgent)
  .agent("Questioner", Questioner);

BrowserTeam.invoke();

const UserAgent = agentci();

UserAgent.agent("BU", BU)
  .agent("Question", Questioner)
  .agent("BrowserTeam", BrowserTeam)
  .rootAgent(function () {
    this.use({
      prompt,
      state,
      llm: openai,
      model,
      agents: ["Questioner"],
    });

    this.callBu = function () {};
    this.callBrowser = function () {};
    this.askQuest = function () {
      const Questioner = this.Questioner;
    };
  });

UserAgent.invoke(prompt);
