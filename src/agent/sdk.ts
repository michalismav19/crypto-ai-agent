/**
 * Loader for @anthropic-ai/claude-agent-sdk.
 *
 * The Agent SDK ships as an ESM-only (ECMAScript Modules (import/export)) package (no "require" export condition),
 * while this project compiles to CommonJS. A normal `import ... from` here
 * would be downleveled by TypeScript into `require(...)`, which fails to
 * load a pure-ESM package on Node versions that don't support `require(esm)`.
 *
 * Loading it via a real, un-downleveled `import()` call works everywhere.
 * The `new Function(...)` wrapper stops TypeScript from rewriting the
 * `import()` into a `require()` call — it stays a genuine dynamic import at
 * runtime. The module is fetched once and cached for the life of the process.
 */
type AgentSdk = typeof import("@anthropic-ai/claude-agent-sdk");

let sdkPromise: Promise<AgentSdk> | null = null;

export function getAgentSdk(): Promise<AgentSdk> {
  if (!sdkPromise) {
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)",
    ) as (specifier: string) => Promise<AgentSdk>;
    sdkPromise = dynamicImport("@anthropic-ai/claude-agent-sdk");
  }
  return sdkPromise;
}
