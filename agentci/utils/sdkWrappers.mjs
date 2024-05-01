function openaiWrapper(openai) {
  function validateSchema(schema, exitConditions) {
    schema = typeof schema === "function" ? schema.apply(Agent, [state]) : schema;
    //later add yum schema validations

    if (exitConditions.functionCall) {
      const fnExists = schema.some(
        (tool) => tool.function.name === exitConditions.functionCall
      );
      if (!fnExists) {
        schema.push({
          type: "function",
          function: {
            name: exitConditions.functionCall,
            description: "Indicate that you are finished with the task",
            parameters: {
              type: "object",
              properties: {
                response: {
                  type: "string",
                  description: "a response to return to the user if necessary",
                },
              },
            },
          },
        });
      }
    }
  }

  function invoke(payload) {
    return openai.chat.completions.create(payload);
  }
  function parseInput(input) {
    let content;
    if (typeof input === "string") {
      content = input;
    } else if (typeof input.image === "string") {
      content = input.image
        ? [
            { type: "text", text: input.message },
            { type: "image_url", image_url: { url: imageEncoder(input.image) } },
          ]
        : input.message;
      return { role: "user", content };
    } else if (typeof input.message === "string") {
      content = input.message;
    } else {
      throw Error(`[Agentci Error]: invalid input for Agent.invoke method.`);
    }
    return { role: "user", content };
  }
  return { invoke, validateSchema, parseInput };
}
export default sdkWrappers = {
  openai: openaiWrapper,
};
