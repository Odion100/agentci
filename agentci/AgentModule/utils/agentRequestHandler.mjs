import sdkWrappers from "../../utils/sdkWrappers.mjs";
import getStringValue from "../../utils/getStringValue.mjs";

export default function agentRequestHandler(Agent, context, input, state) {
  async function runMiddleware(mwList = [], data) {
    for (const middleware of mwList) {
      try {
        const mwOptions = await new Promise((resolve) => middleware(data, resolve));
        if (typeof mwOptions === "object" && mwOptions.hasOwnProperty("return")) {
          context.output = mwOptions.return || mwOptions.output;
        }
        if (!shouldContinue(state, [data.fn])) return;
      } catch (error) {
        console.log(`${context.name}[middleware] error:`, error);
      }
    }
  }
  function parseArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      return {};
    }
  }
  async function callFunctions(toolCalls) {
    const { exitConditions, middleware, agents } = context;
    const fnResponseMessages = [];
    for (const toolCall of toolCalls) {
      const fn = toolCall.function.name;
      if (Agent[fn]) {
        console.log(`${context.name} calling ${fn}...`);

        const args = parseArgs(toolCall.function.arguments);
        console.log("args", args);
        const middlewareData = { fn, state, input, agents, args };
        await runMiddleware(middleware.before[fn], middlewareData);
        console.log("should");
        if (!shouldContinue(state, [])) {
          fnResponseMessages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: fn,
            content: "function all aborted",
          });
          break;
        }
        try {
          const functionResponse = await Agent[fn].apply(Agent, [
            args,
            { agents, state, fn, input },
          ]);
          console.log(`${context.name} ${fn} output: ${functionResponse}`);
          context.output = functionResponse;
          fnResponseMessages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: fn,
            content: getStringValue(functionResponse),
          });
        } catch (error) {
          console.log(`${context.name}.${fn} error:`, error, state, toolCall);
          state.errors.push(error);
          fnResponseMessages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: fn,
            content: error.message ? `error: ${error.message}` : "unexpected error",
          });
        }
      } else if (!exitConditions.functionCall.includes(fn)) {
        const error = { message: "invalid function call", status: 400 };
        state.errors.push(error);
        fnResponseMessages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: fn,
          content: "invalid function call error",
        });
      }
    }
    if (shouldContinue(state, ["$$$"])) {
      for (const toolCall of toolCalls) {
        const fn = toolCall.function.name;
        await runMiddleware(middleware.after[fn], { fn, state, input, agents });
      }
    }
    return fnResponseMessages;
  }

  function shouldContinue(state, fnCalls) {
    const { exitConditions } = context;
    const { iterations, errors } = state;
    return !(
      (exitConditions.shortCircuit && !fnCalls.length && iterations) ||
      (exitConditions.functionCall &&
        exitConditions.functionCall.some((fn) => fnCalls.includes(fn))) ||
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
        ...dynamicSchema(context.schemas.default),
        ...dynamicSchema(context.schemas.internal),
      ],
      context.exitConditions
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
    return typeof context[option] === "function"
      ? context[option]({ state, input })
      : context[option];
  }
  let llm;
  async function runRequests() {
    const { middleware, agents } = context;

    llm = getDynamicValue("llm");
    const systemMessage = { role: "system", content: "" };
    const userMessage = llm.parseInput(input);
    if (state.messages.length) state.messages[0] = systemMessage;
    else state.messages.push(systemMessage);
    state.messages.push(userMessage);
    state.iterations = 0;
    state.errors = [];
    let currentProvider = "";
    let fnCalls = [];
    await runMiddleware(middleware.before.$invoke, {
      fn: "$invoke",
      state,
      input,
      agents,
    });
    while (shouldContinue(state, fnCalls)) {
      fnCalls = [];
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
      if (true) {
        const m = options.messages[options.messages.length - 1];
        console.log(`${context.name} ${m.role}: ${m.content}`);
        console.log(`${context.name} state:`, state.messages);
      }
      try {
        await runMiddleware(middleware.before.$all, {
          fn: "$all",
          state,
          input,
          agents,
        });
        const response = await llm.invoke(options);
        context.output = response.message.content;
        if (response.functionCalls) {
          fnCalls = response.functionCalls.map(({ function: fn }) => fn.name);
          const fnResponseMessages = await callFunctions(response.functionCalls);
          state.messages.push(response.message, ...fnResponseMessages);
        } else {
          state.messages.push(response.message);
        }
      } catch (error) {
        console.log(
          `${context.name} request error:`,
          state.messages[state.messages.length - 2].tool_calls
        );
        throw error;
      } finally {
        await runMiddleware(middleware.after.$all, {
          fn: "$all",
          state,
          input,
          agents,
        });
      }
      state.iterations++;
    }
    await runMiddleware(middleware.after.$invoke, {
      fn: "$invoke",
      state,
      input,
      agents,
    });
    return context.output;
  }

  return runRequests();
}
