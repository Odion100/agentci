import EventEmitter from "events";
import { llmWrappers } from "./utils";

export default function createAgentModule(systemContext) {
  return function AgentModule(constructor) {
    if (
      typeof constructor != "function" ||
      constructor.constructor.name === "AsyncFunction"
    )
      throw `[Agentci Error]: AgentModule cannot use an synchronous function as a constructor`;

    const internalContext = {};
    const middlewareMap = {};

    const Agent = new EventEmitter();

    Agent.use = ({
      llm: llmSdk,
      model,
      schema,
      prompt: promptBuilder,
      provider = "",
      agents = [],
      state = { messages: [] },
      exitConditions = { tries: 0, errors: 0, functionCall: "finished" },
      temperature,
    }) => {
      for (value of [llmSdk, model, schema, promptBuilder, provider]) {
        if (!value)
          throw Error(`[Agentci Error]: required properties for AgentModule.use method
        are this.use({ llm, model, schema, prompt, provider })
        `);
      }

      if (llmWrappers[provider]) {
        const llm = llmWrappers[provider](llmSdk);
        llm.validateSchema(schema);

        Object.assign(internalContext, {
          llm,
          model,
          schema,
          promptBuilder,
          provider,
          state,
          agents,
          exitConditions,
          temperature,
        });
      } else {
        throw Error(`[Agentci Error]: ${provider} is not a supported provider.`);
      }
    };

    Agent.before = (...args) => {
      if (typeof args[0] === "string") {
        const fn = args.shift();
        addMiddleware(`${fn}`, args, middlewareMap);
      } else {
        addMiddleware("invoke", args, middlewareMap);
      }
    };

    constructor.apply(Agent, []);

    function getAgents() {
      return systemContext.agents.reduce(({ name, module }, results) => {
        if (internalContext.agents.includes(name)) results[name] = module;
        return results;
      }, {});
    }

    async function runMiddleware(mwList, data) {
      const agents = getAgents();
      for (const middleware of mwList) {
        await new Promise((resolve) =>
          middleware.apply({ ...Agent, agents }, [data, resolve])
        );
      }
    }

    async function callFunctions(toolCalls = []) {
      const { state, exitConditions } = internalContext;
      const agents = getAgents();

      for (const toolCall of toolCalls) {
        const fn = toolCall.function.name;

        if (Agent[fn]) {
          const args = JSON.parse(toolCall.function.arguments);
          const fnMiddleware = [...middlewareMap["$all"], ...middlewareMap[fn]];
          await runMiddleware(fnMiddleware, { fn, arguments: args, state });
          try {
            const functionResponse = await Agent[fn].apply({ ...Agent, agents }, args);
            console.log("functionResponse:", functionResponse);

            state.messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: fn,
              content: functionResponse,
            });
          } catch (error) {
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
    function shouldContinue(fn, { attempts, errors }) {
      const { exitConditions } = internalContext;
      return !(
        exitConditions.functionCall === fn ||
        (exitConditions.tries && attempts >= exitConditions.tries) ||
        (exitConditions.errors && errors.length >= exitConditions.errors)
      );
    }
    async function invoke(input, previousState = {}) {
      const { invoke: invokeMiddleware } = middlewareMap;
      const { llm, schema: tools, model, promptBuilder, state } = internalContext;
      Object.assign(state, previousState);
      state.attempts = 0;
      state.error = [];
      const agents = getAgents();
      const prompt =
        typeof promptBuilder === string
          ? promptBuilder
          : await promptBuilder.apply({ ...Agent, agents }, [input, state]);
      const systemMessage = { role: "system", content: prompt };
      const userMessage = { role: "user", content: input };
      state.messages.push(systemMessage, userMessage);

      await runMiddleware(invokeMiddleware, { fn: "invoke", state });
      do {
        state.attempts++;
        const response = await llm.invoke({
          model,
          messages: state.messages,
          tools,
          tool_choice: "auto",
        });
        const responseMessage = response.choices[0].message;
        messages.push(responseMessage); // extend conversation with assistant's reply
        console.log("responseMessage--->", responseMessage, responseMessage.tool_calls);
        const toolCalls = responseMessage.tool_calls;
        if (toolCalls) {
          await callFunctions(toolCalls);
        }
      } while (shouldContinue(fn, state));
      return state.messages[state.messages.length - 1].content;
    }
    return { invoke };
  };
}
function addMiddleware(name, mwList, middlewareMap) {
  mwList.forEach(async (middleware) => {
    if (Array.isArray(middleware)) {
      middleware.map(addMiddleware);
    } else {
      addMiddleware(middleware);
    }
  });

  function addMiddleware(middleware) {
    if (Array.isArray(middleware)) return middleware.map(addMiddleware);
    if (!middlewareMap[name]) middlewareMap[name] = [];
    middlewareMap[name].push(middleware);
  }
}
