export default function agentRequestHandler(Agent, internalContext, input, state) {
  async function runMiddleware(mwList = [], data) {
    const { agents } = internalContext;
    for (const middleware of mwList) {
      await new Promise((resolve) =>
        middleware.apply({ ...Agent, agents }, [data, resolve])
      );
    }
  }

  async function callFunctions(toolCalls = []) {
    const { exitConditions, middleware, agents } = internalContext;

    for (const toolCall of toolCalls) {
      const fn = toolCall.function.name;
      console.log("Agent k123", Agent);
      if (Agent[fn]) {
        const args = JSON.parse(toolCall.function.arguments);
        const fnMiddleware = [...(middleware["$all"] || []), ...(middleware[fn] || [])];
        await runMiddleware(fnMiddleware, { fn, arguments: args, state });
        try {
          console.log("args--", args);
          const functionResponse = await Agent[fn].apply({ ...Agent, agents }, [args]);
          console.log("functionResponse:", functionResponse);

          state.messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: fn,
            content: functionResponse,
          });
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
      } else if (exitConditions.functionCall != fn) {
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
  }

  function shouldContinue(state) {
    const { exitConditions } = internalContext;
    const { iterations, errors } = state;
    const fn = state.messages[state.messages.length - 1].tool_calls[0].function.name;
    return !(
      exitConditions.functionCall === fn ||
      (exitConditions.iterations && iterations >= exitConditions.iterations) ||
      (exitConditions.errors && errors.length >= exitConditions.errors) ||
      (typeof exitConditions.state === "function" && exitConditions.state(state))
    );
  }
  function getPrompt() {
    return typeof internalContext.prompt === "function"
      ? internalContext.prompt(state)
      : internalContext.prompt;
  }

  async function runRequests() {
    const { llm, model, temperature, max_tokens, middleware, schema } = internalContext;
    const systemMessage = { role: "system", content: "" };
    const userMessage = llm.parseInput(input);
    state.messages.push(systemMessage, userMessage);
    state.iterations = 0;
    state.errors = [];
    await runMiddleware(middleware.$invoke, { fn: "$invoke", state });

    do {
      state.iterations++;
      systemMessage.content = getPrompt();
      const options = {
        model,
        messages: state.messages,
        tools: schema(),
        tool_choice: "auto",
        temperature,
        max_tokens,
      };
      console.log("options-->", options);
      const response = await llm.invoke(options);
      const responseMessage = response.choices[0].message;
      state.messages.push(responseMessage);
      console.log("responseMessage--->", responseMessage, responseMessage.tool_calls);
      const toolCalls = responseMessage.tool_calls;
      if (toolCalls) {
        await callFunctions(toolCalls);
      }
    } while (shouldContinue(state));
    return state.messages[state.messages.length - 1].content;
  }

  return runRequests();
}
