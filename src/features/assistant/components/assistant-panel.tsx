"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ArrowUp, Bot, History, MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { ErrorState } from "@/components/shared/error-state";
import { MAX_QUESTION_LENGTH, threadTitle, type AssistantMessage, type AssistantStreamEvent } from "../schemas";
import { applyStreamEvent, createStepPacer, initialProgress, readEventStream, type Progress } from "../progress";
import { deleteAssistantThreadAction, loadAssistantAction, loadThreadAction } from "../server/actions";
import type { AssistantThread } from "../server/assistant-repository";
import { MessageItem, ProgressItem, Welcome } from "./assistant-parts";

const OPEN_KEY = "jobpilot.assistant.open";
const FAILED = "The assistant could not answer. Try again.";
const errorBodySchema = z.object({ error: z.string() });

type LoadState = "idle" | "loading" | "ready" | "error";

/** Posts one question and feeds streamed events to `onEvent`. Resolves with the final event. */
async function ask(
  body: { threadId: string | null; message: string; page: string },
  onEvent: (event: AssistantStreamEvent) => void,
): Promise<Extract<AssistantStreamEvent, { type: "done" | "error" }>> {
  const response = await fetch("/api/assistant/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !type.includes("ndjson")) {
    if (response.redirected) return { type: "error", message: "Your session expired. Sign in again." };
    const parsed = errorBodySchema.safeParse(type.includes("json") ? await response.json().catch(() => null) : null);
    return { type: "error", message: parsed.success ? parsed.data.error : FAILED };
  }
  let final: Extract<AssistantStreamEvent, { type: "done" | "error" }> | null = null;
  await readEventStream(response.body, (event) => {
    if (event.type === "done" || event.type === "error") final = event;
    else onEvent(event);
  });
  return final ?? { type: "error", message: "The connection closed before the answer finished. Try again." };
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/**
 * Ask JobPilot: a read-only assistant docked on the right (full screen on small
 * screens). Conversations load when the panel first opens; answers stream in.
 */
export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [aiReady, setAiReady] = useState(false);
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ question: string; progress: Progress } | null>(null);
  const [switching, startSwitching] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadStarted = useRef(false);
  const sending = pending !== null;

  const load = useCallback(async () => {
    setState("loading");
    const result = await loadAssistantAction();
    if (!result.ok) return setState("error");
    setAiReady(result.data.aiReady);
    setThreads(result.data.threads);
    setState("ready");
  }, []);

  const setPanelOpen = useCallback(
    (value: boolean) => {
      setOpen(value);
      if (value && !loadStarted.current) {
        loadStarted.current = true;
        void load();
      }
      try {
        localStorage.setItem(OPEN_KEY, value ? "1" : "0");
      } catch {
        // Storage unavailable (private mode): the panel just starts closed next time.
      }
    },
    [load],
  );

  useEffect(() => {
    let remembered = false;
    try {
      remembered = localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      remembered = false;
    }
    // Restores a client-only preference after hydration (server render is always closed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remembered) setPanelOpen(true);
  }, [setPanelOpen]);

  // Keep the newest content in view while it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const openThread = (id: string) =>
    startSwitching(async () => {
      const result = await loadThreadAction({ threadId: id });
      if (!result.ok) {
        toast.error(result.error);
        setThreads((list) => list.filter((thread) => thread.id !== id));
        return;
      }
      setThreadId(id);
      setMessages(result.data);
    });

  const newConversation = () => {
    setThreadId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setDraft("");
    setPending({ question, progress: initialProgress() });
    // Steps are real server events, paced so each stays visible briefly.
    const pacer = createStepPacer((event) =>
      setPending((current) => current && { ...current, progress: applyStreamEvent(current.progress, event) }),
    );
    let final: Awaited<ReturnType<typeof ask>>;
    try {
      final = await ask({ threadId, message: question, page: window.location.pathname }, pacer.push);
    } catch {
      final = { type: "error", message: FAILED };
    }
    await pacer.settle();
    setPending(null);
    if (final.type === "error") {
      setDraft(question);
      toast.error(final.message);
      return;
    }
    const { threadId: savedId, messages: saved } = final;
    setThreadId(savedId);
    setMessages((list) => [...list, ...saved]);
    setThreads((list) => {
      const existing = list.find((thread) => thread.id === savedId);
      const updated = { id: savedId, title: existing?.title ?? threadTitle(question), updatedAt: new Date().toISOString() };
      return [updated, ...list.filter((thread) => thread.id !== savedId)];
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const deleteActive = async () => {
    if (!threadId) return { ok: true as const, data: null };
    const result = await deleteAssistantThreadAction({ threadId });
    if (result.ok) {
      setThreads((list) => list.filter((thread) => thread.id !== threadId));
      newConversation();
    }
    return result;
  };

  if (!open) {
    return (
      <Button
        onClick={() => setPanelOpen(true)}
        className="fixed right-5 bottom-5 z-40 h-11 gap-2 rounded-full pr-4 pl-1.5 shadow-raised transition-transform hover:-translate-y-0.5"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Bot className="size-4" aria-hidden />
        </span>
        Ask JobPilot
      </Button>
    );
  }

  const activeTitle = threads.find((thread) => thread.id === threadId)?.title ?? "New conversation";
  const canType = state === "ready" && aiReady;

  return (
    <aside
      aria-label="Ask JobPilot"
      onKeyDown={(event) => {
        if (event.key === "Escape" && window.matchMedia("(max-width: 1023px)").matches) setPanelOpen(false);
      }}
      className="fixed inset-0 z-50 flex flex-col bg-card animate-in fade-in slide-in-from-right-4 duration-300 lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-svh lg:w-96 lg:shrink-0 lg:border-l 2xl:w-md"
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <Bot className="size-5 shrink-0 text-brand-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-semibold">Ask JobPilot</p>
          <p className="mt-0.5 truncate text-2xs text-subtle-foreground">{activeTitle}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Conversation history" disabled={state !== "ready" || sending}>
                <History aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
              <DropdownMenuLabel className="text-2xs text-subtle-foreground uppercase">Recent conversations</DropdownMenuLabel>
              {threads.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No saved conversations yet.</p>
              ) : (
                threads.map((thread) => (
                  <DropdownMenuItem key={thread.id} onSelect={() => openThread(thread.id)} className="flex-col items-start gap-0">
                    <span className="w-full truncate text-sm">{thread.title}</span>
                    <span className="text-2xs text-subtle-foreground">{timeAgo(thread.updatedAt)}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {threadId && !sending ? <DeleteButton itemLabel="this conversation" onDelete={deleteActive} /> : null}
          <Button variant="ghost" size="icon-sm" aria-label="New conversation" onClick={newConversation} disabled={sending}>
            <MessageSquarePlus aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close Ask JobPilot" onClick={() => setPanelOpen(false)}>
            <X aria-hidden />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5" aria-busy={sending || switching}>
        {state === "loading" || state === "idle" ? (
          <div className="flex flex-col gap-5">
            <div className="flex gap-3">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="h-14 flex-1" />
            </div>
            <Skeleton className="ml-auto h-9 w-3/5 rounded-2xl" />
          </div>
        ) : state === "error" ? (
          <ErrorState title="Could not load Ask JobPilot" description="Your conversations could not be loaded." onRetry={() => void load()} />
        ) : (
          <div className="flex flex-col gap-6">
            {!aiReady ? (
              <Alert>
                <AlertTitle>AI is not configured</AlertTitle>
                <AlertDescription>
                  Add GEMINI_API_KEY (or OPENAI_API_KEY) to the server environment to ask questions. Saved conversations stay readable.
                </AlertDescription>
              </Alert>
            ) : null}
            {switching ? (
              <div className="flex gap-3">
                <Skeleton className="size-7 rounded-lg" />
                <Skeleton className="h-14 flex-1" />
              </div>
            ) : messages.length === 0 && !pending ? (
              <Welcome disabled={!canType} onPick={(question) => void send(question)} />
            ) : (
              messages.map((message) => <MessageItem key={message.id} message={message} />)
            )}
            {pending ? (
              <>
                <MessageItem message={{ id: "pending", role: "user", content: pending.question, toolsUsed: [], createdAt: "" }} />
                <ProgressItem progress={pending.progress} />
              </>
            ) : null}
          </div>
        )}
      </div>

      <form
        className="shrink-0 px-3 pt-2 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <div className="rounded-2xl border bg-background shadow-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={aiReady || state !== "ready" ? "Ask about your jobs, scores, applications…" : "AI is not configured"}
            aria-label="Your question"
            rows={1}
            maxLength={MAX_QUESTION_LENGTH}
            disabled={!canType}
            className="block field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <span className="hidden pl-1.5 text-2xs text-subtle-foreground sm:inline">Enter to send · Shift + Enter for a new line</span>
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send"
              className="ml-auto rounded-full"
              disabled={!draft.trim() || sending || !canType}
            >
              <ArrowUp aria-hidden />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-2xs text-subtle-foreground">Read-only. Answers come from your JobPilot data; check important details.</p>
      </form>
    </aside>
  );
}
