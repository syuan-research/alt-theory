export function isAgentTool(name: string): boolean {
  return name === "spawn_agent" || name === "send_to_agent" || name === "check_agent" ||
    name === "wait_for_agents" || name === "interrupt_agent" || name === "list_agents" || name === "message_parent";
}

export interface AgentReference {
  sessionId?: string;
  label: string;
}

export function requestedAgentReferences(name: string, args: unknown): AgentReference[] {
  if (!isAgentTool(name) || !args || typeof args !== "object") return [];
  const { name: requestedName, agent, agents } = args as { name?: unknown; agent?: unknown; agents?: unknown };
  const targets = name === "spawn_agent" ? [requestedName] : Array.isArray(agents) ? agents : [agent];
  return targets.flatMap((target) => typeof target === "string" && target.trim() ? [{ label: target }] : []);
}

export function agentReferencesInStatus(tool: string, result: string): AgentReference[] {
  if (tool !== "check_agent" && tool !== "wait_for_agents" && tool !== "list_agents") return [];
  const lines = result.split("\n");
  return (tool === "check_agent" ? lines.slice(0, 1) : lines).flatMap((line) => {
    const match = line.match(/^(.+) \(([^()\s]+)\): (queued|running|idle|finished|failed|interrupted(?: \([^)]+\))?)$/);
    return match ? [{ sessionId: match[2], label: match[1] }] : [];
  });
}
