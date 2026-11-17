import { describe, expect, it } from "vitest";
import { applyStreamEvent, createStepPacer, initialProgress, readEventStream } from "@/features/assistant/progress";
import { parseBlocks, parseInline } from "@/features/assistant/format-text";
import type { AssistantStreamEvent } from "@/features/assistant/schemas";

const run = (events: AssistantStreamEvent[]) => events.reduce(applyStreamEvent, initialProgress());

describe("assistant progress", () => {
  it("starts by reading the question", () => {
    expect(initialProgress().steps).toEqual([{ id: "read", label: "Reading your question", done: false }]);
  });

  it("follows real events: search, review, write", () => {
    const progress = run([
      { type: "thinking", step: 0 },
      { type: "tools", names: ["get_overview", "search_jobs", "search_jobs"] },
      { type: "thinking", step: 1 },
      { type: "text", delta: "You have " },
      { type: "text", delta: "3 jobs." },
    ]);
    expect(progress.steps.map((s) => [s.label, s.done])).toEqual([
      ["Reading your question", true],
      ["Searching overview, jobs", true],
      ["Reviewing what I found", true],
      ["Writing answer", false],
    ]);
    expect(progress.text).toBe("You have 3 jobs.");
  });

  it("drops text streamed before a tool call", () => {
    const progress = run([
      { type: "text", delta: "Let me check." },
      { type: "tools", names: ["get_ai_usage"] },
    ]);
    expect(progress.text).toBe("");
    expect(progress.steps.at(-1)).toMatchObject({ label: "Searching AI usage", done: false });
  });
});

describe("readEventStream", () => {
  it("parses NDJSON split across chunks and skips invalid lines", async () => {
    const encoder = new TextEncoder();
    const parts = ['{"type":"thinking","step":0}\n{"type":"te', 'xt","delta":"hi"}\n{"type":"bogus"}\n', '{"type":"error","message":"x"}'];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const events: AssistantStreamEvent[] = [];
    await readEventStream(body, (event) => events.push(event));
    expect(events).toEqual([
      { type: "thinking", step: 0 },
      { type: "text", delta: "hi" },
      { type: "error", message: "x" },
    ]);
  });
});

describe("format-text", () => {
  it("splits paragraphs, bullet and numbered lists", () => {
    expect(parseBlocks("Overview:\n- 42 jobs\n* 7 qualified\n\n1. Acme\n2) Globex\nDone.")).toEqual([
      { type: "paragraph", lines: ["Overview:"] },
      { type: "bullets", items: ["42 jobs", "7 qualified"] },
      { type: "numbers", items: ["Acme", "Globex"] },
      { type: "paragraph", lines: ["Done."] },
    ]);
  });

  it("strips markdown heading marks and empty input", () => {
    expect(parseBlocks("## Summary\ntext")).toEqual([{ type: "paragraph", lines: ["Summary", "text"] }]);
    expect(parseBlocks("\n\n")).toEqual([]);
  });

  it("finds **bold** segments", () => {
    expect(parseInline("Top: **Acme** (88)")).toEqual([
      { text: "Top: ", bold: false },
      { text: "Acme", bold: true },
      { text: " (88)", bold: false },
    ]);
    expect(parseInline("no bold")).toEqual([{ text: "no bold", bold: false }]);
  });
});

describe("createStepPacer", () => {
  it("keeps each step on screen for the minimum time, in order, and lets text stream after the first chunk", async () => {
    let clock = 0;
    const waits: number[] = [];
    const applied: string[] = [];
    const pacer = createStepPacer((event) => applied.push(event.type === "text" ? `text:${event.delta}` : event.type), {
      minStepMs: 700,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    clock = 100; // the first event arrives 100 ms after "Reading" appeared
    pacer.push({ type: "thinking", step: 0 });
    pacer.push({ type: "tools", names: ["search_jobs"] });
    pacer.push({ type: "thinking", step: 1 });
    pacer.push({ type: "text", delta: "a" });
    pacer.push({ type: "text", delta: "b" });
    await pacer.settle();
    expect(applied).toEqual(["thinking", "tools", "thinking", "text:a", "text:b"]);
    expect(waits).toEqual([600, 700, 700]);
  });

  it("holds the last step briefly when the answer ends without text", async () => {
    let clock = 0;
    const waits: number[] = [];
    const pacer = createStepPacer(() => undefined, { minStepMs: 700, now: () => clock, sleep: async (ms) => void waits.push(ms) });
    clock = 200;
    await pacer.settle();
    expect(waits).toEqual([500]);
  });
});
