export function openaiWrapper(openai) {
  function validateSchema(schema, exitConditions) {
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
  return { invoke, validateSchema };
}

export const llmWrappers = {
  openai: openaiWrapper,
};
