const { App } = require("systemlynx");
const { version } = require("../package.json");

const route = "agentci/api";
const port = process.env.AGENTCI_SERVICE_PORT || 4600;

const Tests = {
  health: async () => ({ ok: true, version, node: process.version }),
  echo: async (input) => ({ ok: true, echoed: input }),
};

(async () => {
  const messageFormat = await import("../agentci/utils/sdkWrappers/messageFormat.mjs");
  const anthropic = await import("../agentci/utils/sdkWrappers/anthropic.mjs");
  const { default: validateSchema } = await import(
    "../agentci/utils/sdkWrappers/validateSchema.mjs"
  );
  const Loops = await import("./loops.mjs");

  // Real framework objects passed straight in as modules — probing these calls
  // the exact functions the execution loop uses, not test doubles.
  const MessageFormat = {
    parseInput: messageFormat.parseInput,
    normalizeMessages: messageFormat.normalizeMessages,
    deNormalizeMessages: messageFormat.deNormalizeMessages,
  };
  const Anthropic = {
    convertMessages: anthropic.convertMessages,
    convertRequest: anthropic.convertRequest,
    convertResponse: anthropic.convertResponse,
    toImageBlock: anthropic.toImageBlock,
  };
  const Schema = { validateSchema };

  App.startService({ route, port })
    .module("Tests", Tests)
    .module("MessageFormat", MessageFormat)
    .module("Anthropic", Anthropic)
    .module("Schema", Schema)
    .module("Loops", {
      openaiToolLoop: Loops.openaiToolLoop,
      anthropicToolLoop: Loops.anthropicToolLoop,
      providerSwitch: Loops.providerSwitch,
      globalExitConditions: Loops.globalExitConditions,
      falsyStateMerge: Loops.falsyStateMerge,
    });

  const SystemViewPlugin = require("systemview-plugin")({
    connection: process.env.SYSTEMVIEW_HOST || "http://localhost:3000/systemview/api",
    specs: "./service/specs",
    projectCode: "agentci",
    serviceId: "Framework",
  });
  App.use(SystemViewPlugin);
})();
