import { createCapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";
import { nonExecutionPort } from "../ports.js";
import { resolveMcpServerDefinitions } from "./config.js";
import type { McpConfig, ResolvedMcpServerDefinition } from "./types.js";

export function listMcpCapabilityPackages(config: McpConfig): CapabilityPackage[] {
  if (!config.enabled) {
    return [];
  }

  return resolveMcpServerDefinitions(config)
    .filter((server) => server.enabled)
    .map(toMcpCapabilityPackage);
}

function toMcpCapabilityPackage(server: ResolvedMcpServerDefinition): CapabilityPackage {
  const profile = createCapabilityProfile({
    kind: "mcp",
    id: `mcp.${server.name}`,
    name: `${server.name} MCP server`,
    description: `MCP server capability exposed to Lead through the shared capability registry.`,
    bestFor: [
      `${server.transport} MCP operations`,
      server.include.length > 0 ? `included tools: ${server.include.slice(0, 8).join(", ")}` : "server-discovered tools",
    ],
    notFor: ["automatic startup as strategy", "machine-owned decisions", "bypassing AssignmentContract"],
    inputSchema: "AssignmentContract plus explicit MCP-backed tool calls selected by Lead",
    outputSchema: "ToolExecutionResult plus ArtifactRef / CloseoutContract evidence when work is delegated",
    budgetPolicy: `MCP server timeout ${server.timeoutMs}ms; Lead decides whether this server is worth starting or using.`,
    tools: server.include,
    cost: server.transport === "stdio" ? "medium" : "high",
    extensionPoint: `mcp:${server.name}`,
  });

  return createCapabilityPackage({
    profile,
    source: {
      kind: "mcp",
      id: `mcp.${server.name}`,
      path: server.cwd || undefined,
      builtIn: false,
    },
    adapter: {
      kind: "mcp",
      id: `mcp.${server.name}.adapter`,
      description: "Adapts configured MCP servers into capability packages without discovering or selecting tools.",
    },
    port: nonExecutionPort("mcp", {
      runner: {
        invocation: "Lead calls an MCP-backed tool; runtime routes it through the configured MCP server.",
      },
      permissionBoundary: {
        world: "MCP server lane",
        autonomy: "MCP server owns its exposed tool behavior; protocol governs docking and evidence.",
        read: ["configured MCP server", "MCP tool arguments"],
        write: ["MCP tool result evidence"],
        forbidden: ["automatic startup as strategy", "machine-selected MCP use", "bypassing AssignmentContract"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "tool",
        streams: ["tool", "result"],
      },
      artifacts: [
        {
          kind: "observation",
          name: "mcp-result",
          description: "Result returned by the MCP-backed tool.",
          required: false,
        },
      ],
      closeout: {
        required: false,
        contract: "CloseoutContract",
        requiredEvidence: [],
        mergeProposal: "none",
      },
      wake: {
        required: false,
        reasons: [],
      },
    }),
    availability: `${server.name} MCP server surface with startup/runtime cost recorded in capability metadata.`,
  });
}
