import { assistantStreamEventSchema, type AssistantStreamEvent } from "./schemas";

/** What each read-only tool looks at, as shown to the user. */
export const TOOL_LABELS: Record<string, string> = {
  get_overview: "overview",
  search_jobs: "jobs",
  get_job_details: "job details",
  get_recent_activity: "recent activity",
  get_ai_usage: "AI usage",
  get_profile_summary: "profile",
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name.replaceAll("_", " ");

export interface ProgressStep {
  id: string;
  label: string;
  done: boolean;
}

/** Live state of one answer in progress, built only from real server events. */
export interface Progress {
  steps: ProgressStep[];
  /** Answer text received so far. */
  text: string;
}

export const initialProgress = (): Progress => ({
  steps: [{ id: "read", label: "Reading your question", done: false }],
  text: "",
});

const finishActive = (steps: ProgressStep[]) => steps.map((step) => (step.done ? step : { ...step, done: true }));

export function applyStreamEvent(progress: Progress, event: AssistantStreamEvent): Progress {
  switch (event.type) {
    case "thinking":
      // The first request is the "Reading" step; later requests review tool results.
      if (event.step === 0) return progress;
      return {
        ...progress,
        steps: [...finishActive(progress.steps), { id: `review-${event.step}`, label: "Reviewing what I found", done: false }],
      };
    case "tools": {
      const labels = [...new Set(event.names.map(toolLabel))];
      return {
        // Text streamed before a tool call is a preamble, not the answer.
        text: "",
        steps: [
          ...finishActive(progress.steps),
          { id: `search-${progress.steps.length}`, label: `Searching ${labels.join(", ")}`, done: false },
        ],
      };
    }
    case "text": {
      const writing = progress.steps.at(-1)?.id === "write";
      return {
        text: progress.text + event.delta,
        steps: writing ? progress.steps : [...finishActive(progress.steps), { id: "write", label: "Writing answer", done: false }],
      };
    }
    default:
      return progress;
  }
}

/** Reads an NDJSON response body and calls `onEvent` for every complete, valid line. */
export async function readEventStream(body: ReadableStream<Uint8Array>, onEvent: (event: AssistantStreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = assistantStreamEventSchema.safeParse(JSON.parse(line));
      if (event.success) onEvent(event.data);
    }
    if (done) return;
  }
}

/** Shortest time a step stays on screen before the next one appears, so each one can be seen. */
export const MIN_STEP_MS = 700;

/**
 * Delays events that start a new step until the current step has been visible for
 * `minStepMs`. Events keep their order; answer text after the first chunk passes straight through.
 */
export function createStepPacer(
  apply: (event: AssistantStreamEvent) => void,
  { minStepMs = MIN_STEP_MS, now = () => Date.now(), sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
) {
  let queue = Promise.resolve();
  let stepShownAt = now();
  let writing = false;

  const startsStep = (event: AssistantStreamEvent) =>
    event.type === "tools" || (event.type === "thinking" && event.step > 0) || (event.type === "text" && !writing);

  const waitForStep = async () => {
    const remaining = stepShownAt + minStepMs - now();
    if (remaining > 0) await sleep(remaining);
  };

  return {
    push(event: AssistantStreamEvent) {
      queue = queue.then(async () => {
        if (startsStep(event)) {
          await waitForStep();
          stepShownAt = now();
          if (event.type === "text") writing = true;
          if (event.type === "tools") writing = false;
        }
        apply(event);
      });
    },
    /** Resolves after every queued event is applied and the last step had its time on screen. */
    async settle() {
      await queue;
      if (!writing) await waitForStep();
    },
  };
}
