import debug from "./debug.mjs";

let sdkImport = null;
function loadSdk() {
  if (!sdkImport) {
    sdkImport = (async () => {
      try {
        const [{ Client }, { StdioClientTransport }] = await Promise.all([
          import("@modelcontextprotocol/sdk/client/index.js"),
          import("@modelcontextprotocol/sdk/client/stdio.js"),
        ]);
        return { Client, StdioClientTransport };
      } catch (error) {
        sdkImport = null;
        throw Error(
          `[Agentci Error]: this.mcp() requires the "@modelcontextprotocol/sdk" package. Install it in your project: npm i @modelcontextprotocol/sdk (${error.message})`
        );
      }
    })();
  }
  return sdkImport;
}

const openConnections = new Set();
let exitHookArmed = false;

export async function connectMcp(spec) {
  const { Client, StdioClientTransport } = await loadSdk();
  let client;
  let closed = false;

  async function open() {
    let transport;
    if (spec.url) {
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      transport = new StreamableHTTPClientTransport(new URL(spec.url));
    } else if (spec.command) {
      transport = new StdioClientTransport({
        command: spec.command,
        args: spec.args || [],
        env: spec.env,
      });
    } else {
      throw Error(
        `[Agentci Error]: this.mcp() spec must include either { command, args } for stdio or { url } for streamable HTTP`
      );
    }
    client = new Client({ name: "agentci", version: "1.0.0" });
    await client.connect(transport);
  }

  await open();
  const { tools } = await client.listTools();

  const connection = {
    tools,
    async callTool(name, args) {
      const call = () => client.callTool({ name, arguments: args || {} });
      try {
        return flattenResult(await call());
      } catch (error) {
        if (closed) throw error;
        // One reconnect on a dropped transport; the registered tool surface is not
        // re-listed mid-run — the model's tool set stays stable within an invoke.
        debug("mcp transport error, reconnecting once:", error.message);
        await open();
        return flattenResult(await call());
      }
    },
    async close() {
      closed = true;
      openConnections.delete(connection);
      await client.close();
    },
  };

  openConnections.add(connection);
  if (!exitHookArmed) {
    exitHookArmed = true;
    process.on("exit", () => {
      for (const conn of openConnections) {
        try {
          conn.close();
        } catch (error) {
          debug("mcp close on exit failed:", error.message);
        }
      }
    });
  }
  return connection;
}

function flattenResult(result) {
  if (!result || !Array.isArray(result.content)) return result;
  const text = result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return result.isError ? `error: ${text}` : text;
}
