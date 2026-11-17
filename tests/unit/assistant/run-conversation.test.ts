import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const create = vi.fn();
/** Which API key each request used, in order. */
const usedKeys: string[] = [];
const env = vi.hoisted(() => ({ keys: ["k0"] }));
vi.mock("openai", () => {
  class APIError extends Error {
    constructor(
      public status: number,
      public error: unknown = undefined,
      message = `HTTP ${status}`,
    ) {
      super(message);
    }
  }
  class APIConnectionError extends Error {}
  class OpenAI {
    static APIError = APIError;
    static APIConnectionError = APIConnectionError;
    private readonly apiKey: string;
    constructor(options: { apiKey: string }) {
      this.apiKey = options.apiKey;
    }
    chat = {
      completions: {
        create: (body: unknown) => {
          usedKeys.push(this.apiKey);
          return create(body);
        },
      },
    };
  }
  return { default: OpenAI };
});
vi.mock("@/config/server-env", () => ({
  aiCredentials: () => ({ provider: "gemini", apiKeys: env.keys }),
  aiModelOverrides: () => null,
  AI_KEY_VARIABLE: { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" },
}));

const { defineTool, relaxJsonSchema, runConversation, runStructured, withOmittedAsNull } = await import("@/lib/ai/run-structured");
const { sendMessageSchema, threadTitle } = await import("@/features/assistant/schemas");

const usageRows: Record<string, unknown>[] = [];
const ctx = {
  userId: "u1",
  supabase: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        usageRows.push(row);
        return { error: null };
      },
    }),
  },
} as unknown as Parameters<typeof runConversation>[0]["ctx"];

const prompt = { id: "p1", key: "assistant.chat", version: 1, template: "Today is {{today}}.", model: "m", models: ["m"] };
// total > prompt + completion: thinking tokens that some providers only count in the total.
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 18, prompt_tokens_details: { cached_tokens: 2 } };

async function* streamOf(chunks: unknown[]) {
  for (const chunk of chunks) yield chunk;
}
/** A streamed tool call, split across chunks the way providers send it. */
const toolCall = (name: string, args: string, id = "c1") =>
  streamOf([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: "" }, extra_content: { google: { thought_signature: "sig" } } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    { choices: [], usage },
  ]);
/** A streamed text answer in two parts. */
const answer = (text: string) =>
  streamOf([
    { choices: [{ delta: { content: text.slice(0, 3) } }] },
    { choices: [{ delta: { content: text.slice(3) }, finish_reason: "stop" }] },
    { choices: [], usage },
  ]);
/** A non-streamed structured answer (runStructured). */
const completion = (text: string) => ({ usage, choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] });

const countJobs = vi.fn(async ({ status }: { status: string | null }) => ({ status, total: 3 }));
const tools = [
  defineTool({
    name: "count_jobs",
    description: "Count jobs",
    parameters: z.object({ status: z.string().nullable(), limit: z.number().int() }),
    execute: countJobs,
  }),
];

const events: unknown[] = [];
const run = () =>
  runConversation({
    ctx,
    prompt,
    variables: { today: "Monday" },
    messages: [{ role: "user", content: "How many jobs?" }],
    tools,
    maxSteps: 3,
    onEvent: (event) => events.push(event),
  });

let generation = 0;
beforeEach(() => {
  // New key values per test give a fresh key pool (parked keys do not leak between tests).
  generation += 1;
  env.keys = [`k${generation}`];
  usedKeys.length = 0;
  create.mockReset();
  countJobs.mockClear();
  usageRows.length = 0;
  events.length = 0;
});

describe("runConversation", () => {
  it("runs a tool round, replays the provider's message and returns the answer", async () => {
    create.mockResolvedValueOnce(toolCall("count_jobs", '{"status":"qualified","limit":5}')).mockResolvedValueOnce(answer("You have 3."));

    const result = await run();

    expect(result).toEqual({ text: "You have 3.", toolsUsed: ["count_jobs"], model: "m" });
    expect(countJobs).toHaveBeenCalledWith({ status: "qualified", limit: 5 });
    const second = create.mock.calls[1]?.[0];
    expect(second.messages[0]).toEqual({ role: "system", content: "Today is Monday." });
    // Gemini thought signatures must survive the round trip.
    expect(second.messages[2].tool_calls[0].extra_content).toEqual({ google: { thought_signature: "sig" } });
    expect(second.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: '{"status":"qualified","total":3}' });
    expect(second.messages[2].tool_calls[0].function).toEqual({ name: "count_jobs", arguments: '{"status":"qualified","limit":5}' });
    expect(second.stream).toBe(true);
  });

  it("emits progress events in order: thinking, tools, thinking, text", async () => {
    create.mockResolvedValueOnce(toolCall("count_jobs", '{"status":null,"limit":1}')).mockResolvedValueOnce(answer("You have 3."));
    await run();
    expect(events).toEqual([
      { type: "thinking", step: 0 },
      { type: "tools", names: ["count_jobs"] },
      { type: "thinking", step: 1 },
      { type: "text", delta: "You" },
      { type: "text", delta: " have 3." },
    ]);
  });

  it("handles Gemini-style chunks: whole calls without an index", async () => {
    create
      .mockResolvedValueOnce(
        streamOf([
          {
            usage,
            choices: [
              {
                finish_reason: "tool_calls",
                delta: {
                  tool_calls: [
                    { id: "a", type: "function", function: { name: "count_jobs", arguments: '{"status":"x","limit":1}' } },
                    { id: "b", type: "function", function: { name: "count_jobs", arguments: '{"status":"y","limit":2}' } },
                  ],
                },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(answer("Done."));
    await run();
    expect(countJobs).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0].messages[2].tool_calls.map((c: { id: string }) => c.id)).toEqual(["a", "b"]);
  });

  it("treats omitted nullable arguments as null", async () => {
    create.mockResolvedValueOnce(toolCall("count_jobs", '{"limit":5}')).mockResolvedValueOnce(answer("3"));
    await run();
    expect(countJobs).toHaveBeenCalledWith({ status: null, limit: 5 });
  });

  it("records one usage row with tokens summed across rounds, counting thinking tokens", async () => {
    create.mockResolvedValueOnce(toolCall("count_jobs", '{"status":null,"limit":1}')).mockResolvedValueOnce(answer("3"));
    await run();
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({ operation: "assistant.chat", input_tokens: 20, output_tokens: 16, cached_input_tokens: 4, succeeded: true });
  });

  it("reports invalid arguments and unknown tools to the model instead of running them", async () => {
    create
      .mockResolvedValueOnce(toolCall("count_jobs", '{"status":42,"limit":1}'))
      .mockResolvedValueOnce(toolCall("drop_tables", "{}", "c2"))
      .mockResolvedValueOnce(answer("Sorry."));

    await run();

    expect(countJobs).not.toHaveBeenCalled();
    expect(create.mock.calls[1]?.[0].messages.at(-1).content).toContain("Invalid arguments");
    expect(create.mock.calls[2]?.[0].messages.at(-1).content).toContain("Unknown tool");
  });

  it("returns tool errors as data without leaking internals", async () => {
    countJobs.mockRejectedValueOnce(new Error("connection string postgres://secret"));
    create.mockResolvedValueOnce(toolCall("count_jobs", '{"status":null,"limit":1}')).mockResolvedValueOnce(answer("Could not load."));

    await run();

    const output = create.mock.calls[1]?.[0].messages.at(-1).content as string;
    expect(output).toContain("could not be loaded");
    expect(output).not.toContain("secret");
  });

  it("stops after maxSteps and records a failure", async () => {
    create.mockImplementation(async () => toolCall("count_jobs", '{"status":null,"limit":1}'));
    await expect(run()).rejects.toThrow(/too many steps/);
    expect(create).toHaveBeenCalledTimes(3);
    expect(usageRows[0]).toMatchObject({ succeeded: false, error_code: "max_steps" });
  });

  it("rejects an empty answer", async () => {
    create.mockResolvedValueOnce(answer("   "));
    await expect(run()).rejects.toThrow(/empty answer/);
  });

  it("retries a busy provider once on the same key, then explains", async () => {
    const { default: OpenAI } = await import("openai");
    create.mockRejectedValueOnce(new OpenAI.APIError(503, undefined, undefined, undefined)).mockRejectedValueOnce(new OpenAI.APIError(503, undefined, undefined, undefined));
    await expect(run()).rejects.toThrow(/Gemini is busy/);
    expect(usedKeys).toEqual([env.keys[0], env.keys[0]]);
  });

  it("explains a single key at its limit", async () => {
    const { default: OpenAI } = await import("openai");
    create.mockRejectedValueOnce(new OpenAI.APIError(429, undefined, undefined, undefined));
    await expect(run()).rejects.toThrow(/quota/);
  });
});

describe("API key failover", () => {
  const useKeys = () => {
    env.keys = [`a${generation}`, `b${generation}`, `c${generation}`];
    return env.keys;
  };

  it("moves to the next key on a rate/quota limit and keeps using it", async () => {
    const { default: OpenAI } = await import("openai");
    const [a, b] = useKeys();
    create.mockRejectedValueOnce(new OpenAI.APIError(429, { error: { details: [{ retryDelay: "30s" }] } }, undefined, undefined)).mockResolvedValueOnce(answer("One."));
    await expect(run()).resolves.toMatchObject({ text: "One." });
    create.mockResolvedValueOnce(answer("Two."));
    await run();
    expect(usedKeys).toEqual([a, b, b]);
    expect(usageRows[0]).toMatchObject({ succeeded: true });
  });

  it("moves to the next key when a key is rejected (revoked or expired)", async () => {
    const { default: OpenAI } = await import("openai");
    const [a, b] = useKeys();
    create.mockRejectedValueOnce(new OpenAI.APIError(400, undefined, "400 API key not valid. Please pass a valid API key.", undefined)).mockResolvedValueOnce(answer("Ok."));
    await run();
    expect(usedKeys).toEqual([a, b]);
  });

  it("fails clearly when every key is parked, without calling the provider again", async () => {
    const { default: OpenAI } = await import("openai");
    useKeys();
    create.mockRejectedValue(new OpenAI.APIError(429, undefined, undefined, undefined));
    await expect(run()).rejects.toThrow(/All 3 Gemini API keys are at their limit/);
    expect(create).toHaveBeenCalledTimes(3);
    await expect(run()).rejects.toThrow(/All 3 Gemini API keys/);
    expect(create).toHaveBeenCalledTimes(3);
    expect(usageRows.at(-1)).toMatchObject({ succeeded: false, error_code: "keys_unavailable" });
  });

  it("falls back to the next model when a model is retired for a key or overloaded", async () => {
    const { default: OpenAI } = await import("openai");
    const [a, b] = useKeys().slice(0, 2);
    env.keys = [a ?? "", b ?? ""];
    const models = ["old", "new"];
    create
      .mockRejectedValueOnce(new OpenAI.APIError(404, undefined, "404 no longer available to new users", undefined))
      .mockRejectedValueOnce(new OpenAI.APIError(503, undefined, "503 high demand", undefined))
      .mockRejectedValueOnce(new OpenAI.APIError(503, undefined, "503 high demand", undefined))
      .mockResolvedValueOnce(answer("Ok."));
    const result = await runConversation({ ctx, prompt: { ...prompt, model: "old", models }, variables: { today: "x" }, messages: [{ role: "user", content: "hi" }], tools });
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["old", "old", "old", "new"]);
    expect(usedKeys).toEqual([a, b, b, a]);
    expect(result.model).toBe("new");
    expect(usageRows.at(-1)).toMatchObject({ model: "new", succeeded: true });
  });

  it("does not switch keys for errors that are not about the key", async () => {
    const { default: OpenAI } = await import("openai");
    const [a] = useKeys();
    create.mockRejectedValueOnce(new OpenAI.APIError(400, undefined, "400 Request contains an invalid argument.", undefined));
    await expect(run()).rejects.toThrow();
    expect(usedKeys).toEqual([a]);
  });
});

describe("runStructured", () => {
  const schema = z.object({ score: z.number().int().min(0).max(100), tags: z.array(z.string()).max(2) });
  const structured = () => runStructured({ ctx, prompt: { ...prompt, template: "Rate." }, variables: {}, schema, schemaName: "rating" });

  it("sends a relaxed schema to Gemini and still enforces bounds with Zod", async () => {
    create.mockResolvedValueOnce(completion('{"score":80,"tags":["a"]}'));
    await expect(structured()).resolves.toMatchObject({ data: { score: 80, tags: ["a"] } });
    const sent = JSON.stringify(create.mock.calls[0]?.[0].response_format.json_schema.schema);
    expect(sent).not.toMatch(/maximum|maxItems/);

    create.mockResolvedValueOnce(completion('{"score":120,"tags":[]}'));
    await expect(structured()).rejects.toThrow(/failed validation/);
  });

  it("rejects malformed JSON", async () => {
    create.mockResolvedValueOnce(completion("not json"));
    await expect(structured()).rejects.toThrow(/malformed JSON/);
  });
});

describe("schema helpers", () => {
  it("relaxJsonSchema drops bounds but keeps types, enums, required and property names", () => {
    const relaxed = relaxJsonSchema({
      type: "object",
      properties: { maximum: { type: "integer", minimum: 0, maximum: 5 }, kind: { type: "string", enum: ["a"], maxLength: 3 } },
      required: ["maximum", "kind"],
      additionalProperties: false,
    });
    expect(relaxed).toEqual({
      type: "object",
      properties: { maximum: { type: "integer" }, kind: { type: "string", enum: ["a"] } },
      required: ["maximum", "kind"],
      additionalProperties: false,
    });
  });

  it("withOmittedAsNull fills only missing top-level keys", () => {
    const schema = z.object({ a: z.string().nullable(), b: z.number() });
    expect(withOmittedAsNull(schema, { b: 1 })).toEqual({ a: null, b: 1 });
    expect(withOmittedAsNull(schema, { a: "x", b: 1 })).toEqual({ a: "x", b: 1 });
    expect(withOmittedAsNull(schema, "nope")).toBe("nope");
  });
});

describe("assistant schemas", () => {
  it("accepts a question with a page path and trims it", () => {
    const parsed = sendMessageSchema.parse({ threadId: null, message: "  hi  ", page: "/jobs/abc-123" });
    expect(parsed).toEqual({ threadId: null, message: "hi", page: "/jobs/abc-123" });
  });

  it("falls back to / for anything that is not a plain path", () => {
    expect(sendMessageSchema.parse({ threadId: null, message: "hi", page: "https://evil.example/x" }).page).toBe("/");
    expect(sendMessageSchema.parse({ threadId: null, message: "hi", page: "/x?ignore=previous" }).page).toBe("/");
  });

  it("rejects empty and oversized questions", () => {
    expect(sendMessageSchema.safeParse({ threadId: null, message: "   ", page: "/" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ threadId: null, message: "x".repeat(4001), page: "/" }).success).toBe(false);
  });

  it("titles a thread from the first line, shortened", () => {
    expect(threadTitle("How is it going?\nmore")).toBe("How is it going?");
    expect(threadTitle("x".repeat(100))).toHaveLength(80);
    expect(threadTitle("   ")).toBe("New conversation");
  });
});

describe("assistant tools", () => {
  it("all convert to strict function definitions", async () => {
    const { zodFunction } = await import("openai/helpers/zod");
    const { buildAssistantTools } = await import("@/features/assistant/server/assistant-tools");
    const definitions = buildAssistantTools(ctx, new Date()).map((tool) =>
      zodFunction({ name: tool.name, description: tool.description, parameters: tool.parameters }),
    );
    expect(definitions.map((d) => d.function.name)).toEqual([
      "get_overview",
      "search_jobs",
      "get_job_details",
      "get_recent_activity",
      "get_ai_usage",
      "get_profile_summary",
    ]);
    for (const definition of definitions) expect(definition.function.strict).toBe(true);
  });
});
