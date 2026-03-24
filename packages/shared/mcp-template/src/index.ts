/**
 * MATEX MCP Server Template
 * 
 * This is the reusable boilerplate for creating new MCP servers.
 * Each server follows this pattern:
 * 
 * 1. Define tools (callable functions)
 * 2. Define resources (readable data)
 * 3. Wire up event bus (publish/subscribe)
 * 4. Wire up logging (every tool call logged)
 * 5. Wire up circuit breaker (for external calls)
 * 
 * Usage:
 *   Copy this template to packages/mcp-servers/your-mcp/src/index.ts
 *   and customize the tools and resources.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================================================
// Types
// ============================================================================

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

interface EventPayload {
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
  server: string;
}

interface LogEntry {
  category: "tool_call" | "event" | "external_api" | "error";
  level: "debug" | "info" | "warn" | "error" | "critical";
  server: string;
  tool?: string;
  action: string;
  user_id?: string;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Configuration
// ============================================================================

const SERVER_NAME = "template-mcp"; // CHANGE THIS
const SERVER_VERSION = "1.0.0";

// ============================================================================
// Event Bus (Redis Streams)
// ============================================================================

class EventBus {
  async publish(event: string, payload: Record<string, unknown>): Promise<void> {
    const eventPayload: EventPayload = {
      event,
      payload,
      timestamp: new Date().toISOString(),
      server: SERVER_NAME,
    };
    // TODO: Publish to Redis Stream
    console.log(`[EVENT] ${event}`, JSON.stringify(eventPayload));
  }

  async subscribe(pattern: string, handler: (event: EventPayload) => Promise<void>): Promise<void> {
    // TODO: Subscribe to Redis Stream consumer group
    console.log(`[SUBSCRIBE] ${SERVER_NAME} subscribing to ${pattern}`);
  }
}

// ============================================================================
// Logger (sends to log-mcp)
// ============================================================================

class Logger {
  async log(entry: LogEntry): Promise<void> {
    const fullEntry = {
      ...entry,
      server: SERVER_NAME,
      timestamp: new Date().toISOString(),
    };
    // TODO: Send to log-mcp via event bus or direct call
    console.log(`[LOG:${entry.level.toUpperCase()}] ${entry.action}`, JSON.stringify(fullEntry));
  }
}

// ============================================================================
// Circuit Breaker (for external service calls)
// ============================================================================

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeout: number = 30000 // 30 seconds
  ) {}

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = "half-open";
      } else if (fallback) {
        return fallback();
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }
}

// ============================================================================
// Tool Registry
// ============================================================================

const tools: Map<string, ToolDefinition> = new Map();

function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

// ============================================================================
// Example Tools (REPLACE WITH YOUR ACTUAL TOOLS)
// ============================================================================

registerTool({
  name: "ping",
  description: "Health check - returns pong",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    return { status: "pong", server: SERVER_NAME, timestamp: new Date().toISOString() };
  },
});

registerTool({
  name: "get_server_info",
  description: "Returns server metadata",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    return {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      tools: Array.from(tools.keys()),
      uptime: process.uptime(),
    };
  },
});

// ============================================================================
// Server Setup
// ============================================================================

async function main(): Promise<void> {
  const eventBus = new EventBus();
  const logger = new Logger();

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Array.from(tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // Handle tool calls with logging
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = tools.get(toolName);

    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const startTime = Date.now();
    try {
      const result = await tool.handler(request.params.arguments ?? {});
      const duration = Date.now() - startTime;

      // Log successful tool call
      await logger.log({
        category: "tool_call",
        level: "info",
        server: SERVER_NAME,
        tool: toolName,
        action: `${SERVER_NAME}.${toolName}`,
        duration_ms: duration,
        success: true,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log failed tool call
      await logger.log({
        category: "tool_call",
        level: "error",
        server: SERVER_NAME,
        tool: toolName,
        action: `${SERVER_NAME}.${toolName}`,
        duration_ms: duration,
        success: false,
        error_message: errorMessage,
      });

      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Publish server started event
  await eventBus.publish(`${SERVER_NAME}.server.started`, {
    version: SERVER_VERSION,
    tools: Array.from(tools.keys()),
  });

  console.error(`${SERVER_NAME} v${SERVER_VERSION} started with ${tools.size} tools`);
}

main().catch(console.error);
