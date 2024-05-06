import sdkWrappers from "../../utils/sdkWrappers.mjs";
export default function agentRequestHandler(Agent, internalContext, input, state) {
  async function runMiddleware(mwList = [], data) {
    for (const middleware of mwList) {
      await new Promise((resolve) => middleware(data, resolve));
    }
  }

  async function callFunctions(toolCall) {
    const {
      exitConditions,
      middleware: { before, after },
      agents,
    } = internalContext;

    const fn = toolCall.function.name;
    if (Agent[fn]) {
      const args = JSON.parse(toolCall.function.arguments);
      const beforeware = [...(before["$all"] || []), ...(before[fn] || [])];
      const afterware = [...(after["$all"] || []), ...(after[fn] || [])];
      const middlewareData = { fn, state, input, agents, arguments: args };
      await runMiddleware(beforeware, middlewareData);
      try {
        const functionResponse = await Agent[fn].apply(Agent, [
          args,
          { agents, state, fn, input },
        ]);
        console.log("functionResponse:", functionResponse);

        state.messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: fn,
          content: functionResponse,
        });
        middlewareData.functionResponse = functionResponse;
        await runMiddleware(afterware, middlewareData);
      } catch (error) {
        console.log("error1", error);
        state.errors.push(error);
        state.messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: fn,
          content: error,
        });
      }
    } else if (!exitConditions.functionCall.includes(fn)) {
      const error = { message: "invalid function call", status: 400 };
      state.errors.push(error);
      state.messages.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: fn,
        content: error,
      });
    }
  }

  function shouldContinue(state, fnCall) {
    const { exitConditions } = internalContext;
    const { iterations, errors } = state;
    const fn = fnCall ? fnCall.function.name : "";
    return !(
      (exitConditions.functionCall && exitConditions.functionCall.includes(fn)) ||
      (exitConditions.iterations && iterations >= exitConditions.iterations) ||
      (exitConditions.errors && errors.length >= exitConditions.errors) ||
      (typeof exitConditions.state === "function" && exitConditions.state(state))
    );
  }
  function getSchema() {
    const dynamicSchema = (schema) =>
      typeof schema === "function" ? schema(state) : schema || [];
    return sdkWrappers[getDynamicValue("provider")]().validateSchema(
      [
        ...dynamicSchema(internalContext.schemas.default),
        ...dynamicSchema(internalContext.schemas.internal),
      ],
      internalContext.exitConditions
    );
  }
  function getDynamicValue(option) {
    if (option === "llm") {
      const provider = getDynamicValue("provider");
      if (!sdkWrappers[provider])
        throw Error(`[Agentci Error]: ${provider} is not a supported provider.`);
      return sdkWrappers[provider](getDynamicValue("sdk"));
    }
    if (option === "schema") return getSchema();
    return typeof internalContext[option] === "function"
      ? internalContext[option](state)
      : internalContext[option];
  }
  let llm;
  async function runRequests() {
    const { middleware, agents, exitConditions } = internalContext;
    await runMiddleware(middleware.before.$invoke, {
      fn: "$invoke",
      state,
      input,
      agents,
    });
    llm = getDynamicValue("llm");
    const systemMessage = { role: "system", content: "" };
    const userMessage = llm.parseInput(input);
    state.messages.push(systemMessage, userMessage);
    state.iterations = 0;
    state.errors = [];
    let currentProvider = "";
    let fnCall;
    do {
      state.iterations++;
      systemMessage.content = getDynamicValue("prompt");
      const options = {
        model: getDynamicValue("model"),
        tools: getDynamicValue("schema"),
        temperature: getDynamicValue("temperature"),
        max_tokens: getDynamicValue("max_tokens"),
        messages: state.messages,
        tool_choice: "auto",
      };
      const provider = getDynamicValue("provider");
      if (provider !== currentProvider) {
        currentProvider = provider;
        llm = getDynamicValue("llm");
      }
      console.log("message", options.messages[options.messages.length - 1]);
      const response = await llm.invoke(options);

      state.messages.push(response.message);

      if (response.functionCall) {
        fnCall = response.functionCall;
        await callFunctions(response.functionCall);
      }
    } while (shouldContinue(state, fnCall));
    return state.messages[state.messages.length - 1].content;
  }

  return runRequests();
}
