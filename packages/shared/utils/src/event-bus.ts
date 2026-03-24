import Redis from "ioredis";
import { now } from "./index";

export interface EventEnvelope {
  event: string;
  payload: Record<string, unknown>;
  publisher: string;
  timestamp: string;
}

export interface EventBusConfig {
  redisUrl: string;
  streamName?: string;
  dlqStreamName?: string;
  groupName?: string;
}

/**
 * Minimal Redis Streams event bus abstraction used by Phase 0 foundation.
 * - publish(): appends events to primary stream
 * - consumeOnce(): reads pending/new events for a consumer group
 * - toDlq(): moves failed events to dead-letter stream
 */
export class MatexEventBus {
  private readonly redis: Redis;
  private readonly stream: string;
  private readonly dlqStream: string;
  private readonly group: string;

  constructor(config: EventBusConfig) {
    this.redis = new Redis(config.redisUrl);
    this.stream = config.streamName ?? "matex.events";
    this.dlqStream = config.dlqStreamName ?? "matex.events.dlq";
    this.group = config.groupName ?? "matex.default";
  }

  async ensureConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", this.stream, this.group, "$", "MKSTREAM");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("BUSYGROUP")) throw error;
    }
  }

  async publish(event: string, payload: Record<string, unknown>, publisher: string): Promise<string> {
    const envelope: EventEnvelope = { event, payload, publisher, timestamp: now() };
    const eventId = await this.redis.xadd(
      this.stream,
      "*",
      "event",
      event,
      "payload",
      JSON.stringify(payload),
      "publisher",
      publisher,
      "timestamp",
      envelope.timestamp,
    );
    return eventId ?? "";
  }

  async consumeOnce(consumerName: string, count = 10, blockMs = 50): Promise<Array<{ id: string; fields: string[] }>> {
    await this.ensureConsumerGroup();
    const rows = (await this.redis.xreadgroup(
      "GROUP",
      this.group,
      consumerName,
      "COUNT",
      String(count),
      "BLOCK",
      String(blockMs),
      "STREAMS",
      this.stream,
      ">",
    )) as Array<[string, Array<[string, string[]]>]> | null;

    if (!rows || rows.length === 0) return [];
    const [, entries] = rows[0] ?? [];
    return (entries ?? []).map(([id, fields]) => ({ id, fields }));
  }

  async acknowledge(id: string): Promise<void> {
    await this.redis.xack(this.stream, this.group, id);
  }

  async toDlq(originalId: string, reason: string, fields: string[]): Promise<void> {
    await this.redis.xadd(
      this.dlqStream,
      "*",
      "original_id",
      originalId,
      "reason",
      reason,
      "fields",
      JSON.stringify(fields),
      "timestamp",
      now(),
    );
  }

  async startConsumerLoop(
    consumerName: string,
    handler: (event: string, payload: Record<string, unknown>, id: string) => Promise<void>,
    opts: { pollIntervalMs?: number; batchSize?: number } = {},
  ): Promise<void> {
    const pollMs = opts.pollIntervalMs ?? 1000;
    const batchSize = opts.batchSize ?? 10;
    await this.ensureConsumerGroup();

    const loop = async () => {
      while (true) {
        try {
          const entries = await this.consumeOnce(consumerName, batchSize, pollMs);
          for (const entry of entries) {
            const fields = entry.fields;
            const eventName = fields[fields.indexOf("event") + 1] ?? "";
            let payload: Record<string, unknown> = {};
            const payloadIdx = fields.indexOf("payload");
            if (payloadIdx >= 0) {
              try { payload = JSON.parse(fields[payloadIdx + 1] ?? "{}"); } catch {}
            }
            try {
              await handler(eventName, payload, entry.id);
              await this.acknowledge(entry.id);
            } catch (err) {
              await this.toDlq(entry.id, err instanceof Error ? err.message : String(err), fields);
              await this.acknowledge(entry.id);
            }
          }
        } catch {
          await new Promise((r) => setTimeout(r, pollMs * 2));
        }
      }
    };

    loop().catch(() => {});
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
