import imageEncoder from "./imageEncoder.mjs";

function openaiWrapper(openai) {
  function validateSchema(schema, exitConditions) {
    schema = typeof schema === "function" ? schema(state) : schema;
    //later add yum schema validations

    const fnExists = schema.some((tool) =>
      exitConditions.functionCall.includes(tool.function.name)
    );
    if (!fnExists) {
      schema.push({
        type: "function",
        function: {
          name: exitConditions.functionCall[0],
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
    return schema;
  }

  async function invoke(payload) {
    const response = await openai.chat.completions.create(payload);
    const message = response.choices[0].message;
    const functionCall = message.tool_calls ? message.tool_calls[0] : null;
    console.log("response->", message);
    return { message: message, functionCall };
  }
  function parseInput(input) {
    let content;
    if (typeof input.image === "string") {
      content = [
        { type: "text", text: input.message },
        { type: "image_url", image_url: { url: imageEncoder(input.image) } },
      ];
    } else if (typeof input.message === "string") {
      content = input.message;
    } else {
      throw Error(`[Agentci Error]: invalid input for Agent.invoke method.`);
    }
    return { role: "user", content };
  }
  return { invoke, validateSchema, parseInput };
}
export default {
  openai: openaiWrapper,
};
