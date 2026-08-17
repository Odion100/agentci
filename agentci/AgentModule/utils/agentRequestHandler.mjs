import sdkWrappers from "../../utils/sdkWrappers/index.mjs";
import getStringValue from "../../utils/getStringValue.mjs";
import debug from "../../utils/debug.mjs";

export default function agentRequestHandler(Agent, context, input, state) {
  async function runMiddleware(mwList = [], data) {
    for (const middleware of mwList) {
      try {
        debug("running middleware:", middleware.name, data.fn);
        const mwOptions = await new Promise((resolve) => middleware(data, resolve));
        if (typeof mwOptions === "object" && mwOptions.hasOwnProperty("return")) {
          context.output =
            mwOptions.return !== undefined ? mwOptions.return : mwOptions.output;
        }
        if (!shouldContinue(state)) break;
      } catch (error) {
        console.error(`${context.name}[middleware] error:`, error);
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
    const functionResponses = toolCalls.map((toolCall) => ({
      tool_call_id: toolCall.id,
      role: "tool",
      name: toolCall.function.name,
      content: "",
    }));
    state.messages.push(...functionResponses);

    if (getDynamicValue("parallelTools") && toolCalls.length > 1) {
      // Parallel mode trades mid-batch aborts for concurrency: exit conditions are
      // evaluated after the whole batch, not between calls.
      await Promise.all(
        toolCalls.map(async (toolCall, i) => {
          const fn = toolCall.function.name;
          if (!Agent[fn]) {
            if (!exitConditions.functionCall.includes(fn)) {
              state.errors.push({ message: "function call aborted", status: 400 });
              functionResponses[i].content = "function call aborted";
            }
            return;
          }
          const args = parseArgs(toolCall.function.arguments);
          const middlewareData = { fn, state, input, agents, args };
          await runMiddleware(middleware.before[fn], middlewareData);
          try {
            const functionOutput = await Agent[fn].apply(Agent, [
              args,
              { agents, state, fn, input },
            ]);
            context.output = functionOutput;
            functionResponses[i].content = getStringValue(functionOutput);
            await runMiddleware(middleware.after[fn], middlewareData);
          } catch (error) {
            console.error(`${context.name}.${fn} error:`, error);
            state.errors.push(error);
            functionResponses[i].content = error.message
              ? `error: ${error.message}`
              : "unexpected error";
          }
        })
      );
      return;
    }

    let abort = false;
    for (const i in toolCalls) {
      const toolCall = toolCalls[i];
      const fn = toolCall.function.name;
      if (Agent[fn] && !abort) {
        debug(`${context.name} calling ${fn}...`);
        const args = parseArgs(toolCall.function.arguments);
        const middlewareData = { fn, state, input, agents, args };
        await runMiddleware(middleware.before[fn], middlewareData);

        if (!shouldContinue(state)) {
          functionResponses[i].content = "function call aborted";
          abort = true;
          break;
        }
        try {
          const functionOutput = await Agent[fn].apply(Agent, [
            args,
            { agents, state, fn, input },
          ]);
          debug(`${context.name} ${fn} output:`, functionOutput);
          context.output = functionOutput;
          functionResponses[i].content = getStringValue(functionOutput);
          if (!shouldContinue(state, [fn])) {
            abort = true;
            break;
          }
          await runMiddleware(middleware.after[fn], middlewareData);
          if (!shouldContinue(state)) {
            abort = true;
          }
        } catch (error) {
          console.error(`${context.name}.${fn} error:`, error);
          state.errors.push(error);
          functionResponses[i].content = error.message
            ? `error: ${error.message}`
            : "unexpected error";
        }
      } else if (!exitConditions.functionCall.includes(fn) || abort) {
        const error = { message: "function call aborted", status: 400 };
        state.errors.push(error);
        functionResponses[i].content = "function call aborted";
        debug("skipping unrecognized function call", toolCall);
      }
    }
  }
  let consecutiveNonFunctionCalls = 0;
  function shouldContinue(state, fnCalls) {
    const { exitConditions } = context;
    const { iterations, errors } = state;
    if (fnCalls) {
      if (fnCalls.length === 0) {
        consecutiveNonFunctionCalls++;
      } else {
        consecutiveNonFunctionCalls = 0;
      }
    } else fnCalls = [];
    return !(
      (exitConditions.shortCircuit &&
        consecutiveNonFunctionCalls >= exitConditions.shortCircuit) ||
      (exitConditions.functionCall &&
        exitConditions.functionCall.some((fn) => fnCalls.includes(fn))) ||
      (exitConditions.iterations && iterations >= exitConditions.iterations) ||
      (exitConditions.errors && errors.length >= exitConditions.errors) ||
      (typeof exitConditions.state === "function" && exitConditions.state(state))
    );
  }
  function getSchema(llm) {
    const dynamicSchema = (schema) =>
      typeof schema === "function" ? schema({ state, input }) : schema || [];
    return llm.validateSchema(
      [
        ...dynamicSchema(context.schemas.default),
        ...dynamicSchema(context.schemas.internal),
        ...dynamicSchema(context.schemas.mcp),
      ],
      context.exitConditions,
      getDynamicValue("strict")
    );
  }
  function getDynamicValue(option) {
    if (option === "llm") {
      const provider = getDynamicValue("provider");
      if (!sdkWrappers[provider])
        throw Error(`[Agentci Error]: ${provider} is not a supported provider.`);
      return sdkWrappers[provider](getDynamicValue("sdk"));
    }
    return typeof context[option] === "function"
      ? context[option]({ state, input })
      : context[option];
  }
  let llm;
  async function runRequests() {
    const { middleware, agents } = context;

    state.iterations = 0;
    state.errors = [];
    let currentProvider = getDynamicValue("provider");
    llm = getDynamicValue("llm");
    const systemMessage = { role: "system", content: "" };
    const userMessage = llm.parseInput(input);
    if (state.messages.length) state.messages[0] = systemMessage;
    else state.messages.push(systemMessage);
    state.messages.push(userMessage);
    let fnCalls = null;
    await runMiddleware(middleware.before.$invoke, {
      fn: "$invoke",
      state,
      input,
      agents,
    });
    while (shouldContinue(state, fnCalls)) {
      fnCalls = [];
      await runMiddleware(middleware.before.$all, {
        fn: "$all",
        functionCalls: fnCalls,
        state,
        input,
        agents,
      });
      const provider = getDynamicValue("provider");
      if (provider !== currentProvider) {
        currentProvider = provider;
        llm = getDynamicValue("llm");
      }
      systemMessage.content = getDynamicValue("prompt");
      const options = {
        model: getDynamicValue("model"),
        messages: state.messages,
      };
      const temperature = getDynamicValue("temperature");
      const max_tokens = getDynamicValue("max_tokens");
      if (temperature !== undefined) options.temperature = temperature;
      if (max_tokens !== undefined) options.max_tokens = max_tokens;
      for (const opt of ["strict", "responseSchema", "retries"]) {
        const value = getDynamicValue(opt);
        if (value !== undefined) options[opt] = value;
      }
      // onToken is a callback, not a dynamic value — never resolve it
      if (context.onToken !== undefined) options.onToken = context.onToken;
      const tools = getSchema(llm);
      if (tools.length) {
        options.tools = tools;
        options.tool_choice = "auto";
      }

      try {
        const response = await llm.invoke(options);
        context.output = response.message.content;
        state.messages.push(response.message);
        debug(`${context.name} ${response.message.role}:`, response.message.content);
        if (response.functionCalls) {
          fnCalls = response.functionCalls.map(({ function: fn }) => fn.name);
          await callFunctions(response.functionCalls);
        }
      } catch (error) {
        console.error(`${context.name} request error:`, error);
        throw error;
      } finally {
        await runMiddleware(middleware.after.$all, {
          fn: "$all",
          functionCalls: fnCalls,
          state,
          input,
          agents,
        });
      }
      state.iterations++;
    }
    debug("exiting the loop...");
    await runMiddleware(middleware.after.$invoke, {
      fn: "$invoke",
      state,
      input,
      agents,
    });
    debug("returning output", context.output);
    return context.output;
  }

  return runRequests();
}
