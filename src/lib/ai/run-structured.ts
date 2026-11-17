import "server-only";
import OpenAI from "openai";
import { ContentFilterFinishReasonError, LengthFinishReasonError } from "openai/core/error";
import { zodFunction, zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionChunk, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { AI_KEY_VARIABLE, aiCredentials, aiModelOverrides, type AiProvider } from "@/config/server-env";
import { logger } from "@/lib/monitoring/logger";
import { classifyFailure, KeyPool, pairId, type Candidate, type Failure } from "./key-pool";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError, UserFacingError } from "@/server/errors";

/*
 * The single entry point for model calls (docs/ai/ai-architecture.md):
 * active prompt version from the database → structured output constrained by a Zod
 * schema (or validated tool calls) → re-validated → usage recorded. Features never
 * import the OpenAI SDK.
 *
 * Calls use the Chat Completions API, which OpenAI and Gemini's OpenAI-compatible
 * endpoint both support, so the provider is a configuration choice (AI_PROVIDER).
 */

export class AiOutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiOutputError";
  }
}

export interface ActivePrompt {
  id: string;
  key: string;
  version: number;
  template: string;
  /** Preferred model (first of `models`): used for provenance hashes and as the label. */
  model: string;
  /** Models to try in order when the preferred one is unavailable, overloaded or out of quota. */
  models: string[];
}

interface ProviderSettings {
  label: string;
  baseURL: string | undefined;
  /** Models for every prompt on this provider, in fallback order; null = the prompt version's `default_model`. */
  defaultModels: string[] | null;
  /** Send output schemas without bounds (Gemini rejects bounded schemas as "too many states"). */
  relaxSchema: boolean;
}

const PROVIDERS: Record<AiProvider, ProviderSettings> = {
  gemini: {
    label: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    // Verified 2026-11-17: 2.5-flash is retired for newer projects (404), so newer models follow as fallbacks.
    defaultModels: ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite"],
    relaxSchema: true,
  },
  openai: { label: "OpenAI", baseURL: undefined, defaultModels: null, relaxSchema: false },
};

const BOUND_KEYWORDS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minItems", "maxItems", "minLength", "maxLength", "pattern", "format",
]);

/**
 * Removes value bounds from a JSON schema, keeping its shape (types, enums, required keys).
 * Zod still enforces every bound after the call.
 */
export function relaxJsonSchema(schema: unknown): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node === null || typeof node !== "object") return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !BOUND_KEYWORDS.has(key))
        // Recurse into sub-schemas only; "properties" maps names (which could match a keyword) to schemas.
        .map(([key, value]) => [key, key === "properties" ? stripProperties(value) : strip(value)]),
    );
  };
  const stripProperties = (properties: unknown): unknown =>
    properties && typeof properties === "object"
      ? Object.fromEntries(Object.entries(properties).map(([name, sub]) => [name, strip(sub)]))
      : properties;
  const result = strip(schema);
  return result && typeof result === "object" && !Array.isArray(result) ? Object.fromEntries(Object.entries(result)) : {};
}

const MAX_OUTPUT_TOKENS = 8_000;
const SERVER_ERROR_RETRY_MS = 1_500;

export function isAiConfigured(): boolean {
  return aiCredentials() !== null;
}

interface AiRuntime {
  provider: AiProvider;
  pool: KeyPool;
}

let runtime: (AiRuntime & { cacheKey: string }) | undefined;
const clients = new Map<string, OpenAI>();

/** Provider and key pool; rebuilt (fresh pool state) when the configured keys change. */
function aiRuntime(): AiRuntime {
  const credentials = aiCredentials();
  if (!credentials) throw new UserFacingError("AI is not configured. Add GEMINI_API_KEY (or OPENAI_API_KEY) to the server environment.");
  const cacheKey = `${credentials.provider}:${credentials.apiKeys.join(",")}`;
  if (runtime?.cacheKey !== cacheKey) {
    runtime = { cacheKey, provider: credentials.provider, pool: new KeyPool(credentials.apiKeys) };
    clients.clear();
  }
  return runtime;
}

function clientFor(provider: AiProvider, apiKey: string): OpenAI {
  let client = clients.get(apiKey);
  if (!client) {
    // SDK retries are off: a 429 should move to the next key at once, not wait on the same key.
    client = new OpenAI({ apiKey, baseURL: PROVIDERS[provider].baseURL, timeout: 90_000, maxRetries: 0 });
    clients.set(apiKey, client);
  }
  return client;
}

const isRetryableServerError = (error: unknown) =>
  error instanceof OpenAI.APIConnectionError || (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500);

/**
 * Runs one model request on the first usable (model, key) pair. On a rate/quota limit,
 * rejected key, unavailable or overloaded model, that pair (or key, or model) is parked and
 * the request moves on: same model on the next key first, then the next model.
 * Server errors (5xx, connection) are retried once on the same pair before moving on.
 */
async function withFailover<T>(
  { provider, pool }: AiRuntime,
  meter: UsageMeter,
  models: readonly string[],
  request: (client: OpenAI, model: string) => Promise<T>,
): Promise<T> {
  const tried = new Set<string>();
  let lastFailure: Failure["kind"] | null = null;
  for (;;) {
    const candidate = pool.next(Date.now(), models, tried);
    if (!candidate) {
      meter.fail("keys_unavailable", new Error("no usable key or model"));
      throw new UserFacingError(unavailableMessage(provider, pool, models, lastFailure));
    }
    tried.add(pairId(candidate.keyIndex, candidate.model));
    meter.model = candidate.model;
    const client = clientFor(provider, pool.keys[candidate.keyIndex] ?? "");
    try {
      try {
        return await request(client, candidate.model);
      } catch (error) {
        if (!isRetryableServerError(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, SERVER_ERROR_RETRY_MS));
        return await request(client, candidate.model);
      }
    } catch (error) {
      if (!(error instanceof OpenAI.APIError)) throw error;
      const failure = classifyFailure(error.status, error.message, error.error);
      if (!failure) throw error;
      lastFailure = failure.kind;
      logParked(provider, candidate, failure, pool.park(candidate, failure, Date.now()));
    }
  }
}

function logParked(provider: AiProvider, { keyIndex, model }: Candidate, failure: Failure, until: number) {
  // Key number only (1-based, order in .env.local); never the key itself.
  logger.warn("ai.key.parked", { provider, keyNumber: keyIndex + 1, model, reason: failure.kind, until: new Date(until).toISOString() });
}

function unavailableMessage(provider: AiProvider, pool: KeyPool, models: readonly string[], lastFailure: Failure["kind"] | null): string {
  const label = PROVIDERS[provider].label;
  if (pool.keys.length === 1 && models.length === 1) {
    if (lastFailure === "rejected") return `${label} rejected the API key. Check ${AI_KEY_VARIABLE[provider]}.`;
    if (lastFailure === "overloaded") return `${label} is busy right now (high demand). Try again in a minute.`;
    if (lastFailure === "model_unavailable") return `The model "${models[0]}" is not available to this API key.`;
    return `${label} rate limit or free-tier quota reached. Wait a minute and try again.`;
  }
  const at = pool.nextAvailableAt(models);
  const minutes = at ? Math.max(1, Math.ceil((at - Date.now()) / 60_000)) : null;
  return `All ${pool.keys.length} ${label} API keys are at their limit, busy or were rejected for every model.${minutes ? ` Try again in about ${minutes} min.` : ""}`;
}

export async function loadActivePrompt({ supabase }: AuthenticatedContext, key: string): Promise<ActivePrompt> {
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, prompt_key, version, template, default_model")
    .eq("prompt_key", key)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new RepositoryError(`Failed to load prompt ${key}`, { cause: error });
  if (!data) throw new RepositoryError(`No active prompt version for ${key}. Apply the latest migrations.`);
  const provider = aiCredentials()?.provider ?? "openai";
  const models = aiModelOverrides() ?? PROVIDERS[provider].defaultModels ?? [data.default_model];
  return {
    id: data.id,
    key: data.prompt_key,
    version: data.version,
    template: data.template,
    model: models[0] ?? data.default_model,
    models,
  };
}

/** Replaces {{name}} placeholders; every placeholder must be provided. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) throw new Error(`Missing prompt variable: ${name}`);
    return value;
  });
}

interface RunStructuredOptions<T> {
  ctx: AuthenticatedContext;
  prompt: ActivePrompt;
  variables: Record<string, string>;
  schema: z.ZodType<T>;
  schemaName: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  promptVersionId: string;
}

export async function runStructured<T>({
  ctx,
  prompt,
  variables,
  schema,
  schemaName,
}: RunStructuredOptions<T>): Promise<StructuredResult<T>> {
  const meter = new UsageMeter(ctx, prompt);
  try {
    const ai = aiRuntime();
    meter.provider = ai.provider;
    const { json_schema: jsonSchema } = zodResponseFormat(schema, schemaName);
    const content = renderTemplate(prompt.template, variables);
    const completion = await withFailover(ai, meter, prompt.models, (client, model) =>
      client.chat.completions.create({
        model,
        messages: [{ role: "user", content }],
        response_format: {
          type: "json_schema",
          json_schema: { ...jsonSchema, schema: PROVIDERS[ai.provider].relaxSchema ? relaxJsonSchema(jsonSchema.schema) : jsonSchema.schema },
        },
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      }),
    );
    meter.add(completion.usage);

    const choice = completion.choices[0];
    if (!choice?.message.content) throw meter.fail("empty_output", new AiOutputError("The model returned no answer."));
    if (choice.message.refusal) throw meter.fail("refusal", new AiOutputError("The model declined this request."));
    if (choice.finish_reason === "length") throw meter.fail("incomplete", new AiOutputError("The model stopped early (answer too long)."));
    let json: unknown;
    try {
      json = JSON.parse(choice.message.content);
    } catch (error) {
      throw meter.fail("invalid_output", new AiOutputError("The model returned malformed JSON.", { cause: error }));
    }
    // Re-validate: structured output constrains shape, Zod enforces every rule (including relaxed bounds).
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw meter.fail("invalid_output", new AiOutputError("The model returned output that failed validation.", { cause: parsed.error }));
    }
    meter.succeeded = true;
    return { data: parsed.data, model: meter.model, promptVersionId: prompt.id };
  } catch (error) {
    throw meter.translate(error);
  } finally {
    await meter.record();
  }
}

/** A read-only function the model may call. Arguments are validated with `parameters` before `execute` runs. */
export interface AiTool {
  name: string;
  description: string;
  /** Strict-mode schema: every property required; use `.nullable()` for optional values. */
  parameters: z.ZodType;
  execute: (args: unknown) => Promise<unknown>;
}

/** Ties a tool's `execute` argument type to its schema; arguments are parsed before `execute` is called. */
export function defineTool<S extends z.ZodType>(tool: {
  name: string;
  description: string;
  parameters: S;
  execute: (args: z.output<S>) => Promise<unknown>;
}): AiTool {
  return {
    ...tool,
    execute: async (args) => tool.execute(tool.parameters.parse(args)),
  };
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/** Progress of one assistant turn, for live UI. */
export type ConversationEvent =
  /** A model request started (first: reading the question; later: reviewing tool results). */
  | { type: "thinking"; step: number }
  /** The model asked for these tools; they are running now. */
  | { type: "tools"; names: string[] }
  /** Part of the final answer text. */
  | { type: "text"; delta: string };

interface RunConversationOptions {
  ctx: AuthenticatedContext;
  prompt: ActivePrompt;
  variables: Record<string, string>;
  /** Earlier turns plus the new user message, oldest first. */
  messages: ConversationMessage[];
  tools: AiTool[];
  /** Upper bound on model requests in one turn (tool rounds + final answer). */
  maxSteps?: number;
  onEvent?: (event: ConversationEvent) => void;
}

export interface ConversationResult {
  text: string;
  toolsUsed: string[];
  model: string;
}

const MAX_TOOL_OUTPUT_CHARS = 30_000;

/**
 * One assistant turn with function calling: the model may call the given tools
 * (several rounds) before answering in text. Responses are streamed so progress and
 * answer text reach the UI as they happen. Usage for the whole turn is recorded once.
 */
export async function runConversation({
  ctx,
  prompt,
  variables,
  messages,
  tools,
  maxSteps = 6,
  onEvent = () => undefined,
}: RunConversationOptions): Promise<ConversationResult> {
  const meter = new UsageMeter(ctx, prompt);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const definitions = tools.map((tool) => zodFunction({ name: tool.name, description: tool.description, parameters: tool.parameters }));
  const toolsUsed = new Set<string>();

  try {
    const ai = aiRuntime();
    meter.provider = ai.provider;
    let input: ChatCompletionMessageParam[] = [
      { role: "system", content: renderTemplate(prompt.template, variables) },
      ...messages.map(({ role, content }): ChatCompletionMessageParam => ({ role, content })),
    ];

    for (let step = 0; step < maxSteps; step += 1) {
      onEvent({ type: "thinking", step });
      const messagesSoFar = input;
      const stream = await withFailover(ai, meter, prompt.models, (client, model) =>
        client.chat.completions.create({
          model,
          messages: messagesSoFar,
          tools: definitions,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          stream_options: { include_usage: true },
        }),
      );
      const turn = await collectTurn(stream, (delta) => onEvent({ type: "text", delta }));
      meter.add(turn.usage);
      if (turn.finishReason === "length") {
        throw meter.fail("incomplete", new AiOutputError("The model stopped early (answer too long)."));
      }

      if (turn.toolCalls.length === 0) {
        const text = turn.content.trim();
        if (!text) throw meter.fail("empty_output", new AiOutputError("The model returned an empty answer."));
        meter.succeeded = true;
        return { text, toolsUsed: [...toolsUsed], model: meter.model };
      }

      onEvent({ type: "tools", names: turn.toolCalls.map((call) => call.function.name) });
      const outputs = await Promise.all(
        turn.toolCalls.map(async (call): Promise<ChatCompletionMessageParam> => {
          toolsUsed.add(call.function.name);
          return { role: "tool", tool_call_id: call.id, content: await runTool(ctx, byName.get(call.function.name), call.function.arguments) };
        }),
      );
      // The assistant message is replayed with everything the provider sent: tool calls can
      // carry data needed on the next round (e.g. Gemini thought signatures in extra_content).
      const assistant: ChatCompletionMessageParam = { role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls };
      input = [...input, assistant, ...outputs];
    }
    throw meter.fail("max_steps", new AiOutputError("The assistant needed too many steps to answer. Try a narrower question."));
  } catch (error) {
    throw meter.translate(error);
  } finally {
    await meter.record();
  }
}

interface StreamedToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  [extra: string]: unknown;
}

const KNOWN_TOOL_CALL_KEYS = new Set(["index", "id", "type", "function"]);

/** Rebuilds one streamed response: answer text (forwarded as it arrives), tool calls and usage. */
export async function collectTurn(stream: AsyncIterable<ChatCompletionChunk>, onText: (delta: string) => void) {
  let content = "";
  let finishReason: string | null = null;
  let usage: UsageReport | null = null;
  // Keyed by index (OpenAI streams parts of a call by index) or id (Gemini sends whole calls without an index).
  const calls = new Map<string, StreamedToolCall>();
  let lastKey: string | null = null;

  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices) {
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (delta?.content) {
        content += delta.content;
        onText(delta.content);
      }
      for (const part of delta?.tool_calls ?? []) {
        const { index, id, function: fn } = part;
        const key: string = typeof index === "number" ? `i${index}` : id ? `id${id}` : (lastKey ?? "i0");
        lastKey = key;
        const call = calls.get(key) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
        // Keep provider-specific fields (e.g. extra_content) so they can be sent back unchanged.
        for (const [key, value] of Object.entries(part)) if (!KNOWN_TOOL_CALL_KEYS.has(key)) call[key] = value;
        if (id) call.id = id;
        if (fn?.name) call.function.name += fn.name;
        if (fn?.arguments) call.function.arguments += fn.arguments;
        calls.set(key, call);
      }
    }
  }
  const toolCalls = [...calls.values()];
  return { content, finishReason, usage, toolCalls };
}

/**
 * Some providers (Gemini) leave out arguments they mean as null instead of sending
 * every property as strict mode asks. Treat an omitted top-level property as null;
 * Zod still rejects it when the property is not nullable.
 */
export function withOmittedAsNull(schema: z.ZodType, args: unknown): unknown {
  if (!(schema instanceof z.ZodObject) || args === null || typeof args !== "object" || Array.isArray(args)) return args;
  const filled: Record<string, unknown> = Object.fromEntries(Object.keys(schema.shape).map((key) => [key, null]));
  return { ...filled, ...args };
}

/** Tool failures are reported to the model as data so it can tell the user; they never abort the turn. */
async function runTool(ctx: AuthenticatedContext, tool: AiTool | undefined, rawArguments: string): Promise<string> {
  if (!tool) return JSON.stringify({ error: "Unknown tool." });
  let json: unknown;
  try {
    json = JSON.parse(rawArguments || "{}");
  } catch {
    return JSON.stringify({ error: "Arguments were not valid JSON." });
  }
  const args = tool.parameters.safeParse(withOmittedAsNull(tool.parameters, json));
  if (!args.success) {
    return JSON.stringify({ error: "Invalid arguments.", issues: args.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
  }
  try {
    const result = JSON.stringify(await tool.execute(args.data)) ?? "null";
    return result.length > MAX_TOOL_OUTPUT_CHARS ? `${result.slice(0, MAX_TOOL_OUTPUT_CHARS)}…(truncated)` : result;
  } catch (error) {
    logger.error("ai.tool.failed", { userId: ctx.userId, tool: tool.name, error });
    return JSON.stringify({ error: error instanceof UserFacingError ? error.message : "The data could not be loaded." });
  }
}

interface UsageReport {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

/** Accumulates tokens for one logical AI operation and writes one ai_usage_events row. */
class UsageMeter {
  private readonly started = Date.now();
  private readonly tokens = { input: 0, output: 0, cached: 0 };
  private errorCode: string | null = null;
  provider: AiProvider | null = null;
  /** Model actually used (changes when failover moves to another model). */
  model: string;
  succeeded = false;

  constructor(
    private readonly ctx: AuthenticatedContext,
    private readonly prompt: ActivePrompt,
  ) {
    this.model = prompt.model;
  }

  add(usage: UsageReport | null | undefined) {
    if (!usage) return;
    this.tokens.input += usage.prompt_tokens;
    // Some providers leave thinking tokens out of completion_tokens but count them in the total.
    this.tokens.output += Math.max(usage.completion_tokens, (usage.total_tokens ?? 0) - usage.prompt_tokens);
    this.tokens.cached += usage.prompt_tokens_details?.cached_tokens ?? 0;
  }

  fail<E extends Error>(code: string, error: E): E {
    this.errorCode = code;
    return error;
  }

  /** Maps SDK errors to messages the user can act on; anything else passes through. */
  translate(error: unknown): unknown {
    if (error instanceof AiOutputError || error instanceof UserFacingError) return error;
    if (error instanceof LengthFinishReasonError) return this.fail("incomplete", new AiOutputError("The model stopped early (answer too long)."));
    if (error instanceof ContentFilterFinishReasonError) return this.fail("content_filter", new AiOutputError("The model's safety filter blocked this answer."));
    // Key, quota, model and overload errors are handled by withFailover; what reaches here is logged as is.
    if (error instanceof OpenAI.APIError) {
      this.errorCode = `http_${error.status ?? "unknown"}`;
    } else {
      this.errorCode ??= "network";
    }
    return error;
  }

  async record() {
    const { error } = await this.ctx.supabase.from("ai_usage_events").insert({
      user_id: this.ctx.userId,
      operation: this.prompt.key,
      model: this.model,
      prompt_version_id: this.prompt.id,
      input_tokens: this.tokens.input,
      output_tokens: this.tokens.output,
      cached_input_tokens: this.tokens.cached,
      // Prices change often; tokens are recorded and cost is left unknown rather than guessed.
      estimated_cost_usd: null,
      latency_ms: Date.now() - this.started,
      succeeded: this.succeeded,
      error_code: this.errorCode,
    });
    if (error) logger.error("ai.usage.record_failed", { userId: this.ctx.userId, error });
  }
}
