export default function debug(...args) {
  if (process.env.AGENTCI_DEBUG) console.log("[agentci]", ...args);
}
