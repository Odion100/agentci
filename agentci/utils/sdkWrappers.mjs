import imageEncoder from "./imageEncoder.mjs";

function openaiWrapper(openai) {
  function validateSchema(schema, exitConditions) {
    // schema = typeof schema === "function" ? schema(state) : schema;
    // //later add yum schema validations

    // const fnExists = schema.some((tool) =>
    //   exitConditions.functionCall.includes(tool.function.name)
    // );
    // if (!fnExists && !exitConditions.shortCircuit && !exitConditions.iterations) {
    //   schema.push({
    //     type: "function",
    //     function: {
    //       name: exitConditions.functionCall[0],
    //       description: "Indicate that you are finished with the task",
    //       parameters: {
    //         type: "object",
    //         properties: {
    //           response: {
    //             type: "string",
    //             description: "a response to return to the user if necessary",
    //           },
    //         },
    //       },
    //     },
    //   });
    // }
    return schema;
  }

  async function invoke(payload) {
    const response = await openai.chat.completions.create(payload);
    const message = response.choices[0].message;
    const functionCalls = message.tool_calls ? message.tool_calls : null;
    return { message: message, functionCalls };
  }

  function parseInput(input) {
    let content;
    if (typeof input.image === "string") {
      content = [
        { type: "text", text: input.message },
        { type: "image_url", image_url: { url: imageEncoder(input.image) } },
      ];
    } else if (Array.isArray(input.images)) {
      content = [{ type: "text", text: input.message }];
      for (const image of input.images) {
        content.push({
          type: "image_url",
          image_url: { url: imageEncoder(image) },
        });
      }
    } else if (typeof input.message === "string") {
      content = input.message;
    } else {
      throw Error(`[Agentci Error]: invalid input for Agent.invoke method.`);
    }
    return { role: "user", content };
  }
  function normalizeMessages(messages) {
    return messages.map((message) => {
      let normalizedMessage = {
        role: message.role,
        date: new Date().toISOString(),
      };

      // Handle content
      if (message.content) {
        if (typeof message.content === "string") {
          normalizedMessage.message = message.content;
        } else if (Array.isArray(message.content)) {
          const textContent = message.content.find((item) => item.type === "text");
          if (textContent) {
            normalizedMessage.message = textContent.text;
          }

          const imageUrls = message.content
            .filter((item) => item.type === "image_url")
            .map((item) => item.image_url);

          if (imageUrls.length === 1) {
            normalizedMessage.image = imageUrls[0];
          } else if (imageUrls.length > 1) {
            normalizedMessage.images = imageUrls;
          }
        }
      }

      // Handle function calls
      if (message.tool_calls) {
        normalizedMessage.tool_calls = message.tool_calls.map((tool_call) => ({
          id: tool_call.id,
          type: tool_call.type,
          function: {
            name: tool_call.function.name,
            arguments: tool_call.function.arguments,
          },
        }));

        // Create a string representation of tool calls
        normalizedMessage.message = message.tool_calls
          .map((tool_call) => `calling ${tool_call.function.name}(...)`)
          .join("\n");
      }

      // Ensure there's always a message property
      if (!normalizedMessage.message) {
        normalizedMessage.message = "";
      }

      // Include user if present
      if (message.user) {
        normalizedMessage.user = message.user;
      }

      return normalizedMessage;
    });
  }

  function deNormalizeMessages(normalizedMessages) {
    return normalizedMessages.map((normalizedMessage) => {
      let deNormalizedMessage = {
        role: normalizedMessage.role,
      };

      // Reconstruct content
      if (
        normalizedMessage.image !== undefined ||
        normalizedMessage.images !== undefined
      ) {
        deNormalizedMessage.content = [];

        if (normalizedMessage.message) {
          deNormalizedMessage.content.push({
            type: "text",
            text: normalizedMessage.message,
          });
        }

        if (normalizedMessage.image !== undefined) {
          deNormalizedMessage.content.push({
            type: "image_url",
            image_url: normalizedMessage.image,
          });
        } else if (normalizedMessage.images) {
          normalizedMessage.images.forEach((image) => {
            deNormalizedMessage.content.push({ type: "image_url", image_url: image });
          });
        }
      } else {
        deNormalizedMessage.content = normalizedMessage.message;
      }

      // Reconstruct tool calls
      if (normalizedMessage.tool_calls) {
        deNormalizedMessage.tool_calls = normalizedMessage.tool_calls;
      }

      // Include user if present
      if (normalizedMessage.user) {
        deNormalizedMessage.user = normalizedMessage.user;
      }

      return deNormalizedMessage;
    });
  }
  return { invoke, validateSchema, parseInput, normalizeMessages, deNormalizeMessages };
}
export default {
  openai: openaiWrapper,
};
