"use client";

import { useState } from "react";
import { Activity, Check, CircleCheck, Copy, Database, History, Bot, Loader2, Target, Trophy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseBlocks, parseInline } from "../format-text";
import { toolLabel, type Progress } from "../progress";
import type { AssistantMessage } from "../schemas";

export function AssistantAvatar({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-12 rounded-2xl [&_svg]:size-6",
      )}
    >
      <Bot />
    </span>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-semibold text-foreground">
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function FormattedText({ text, trailing }: { text: string; trailing?: React.ReactNode }) {
  const blocks = parseBlocks(text);
  return (
    <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-card-foreground">
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;
        if (block.type === "paragraph") {
          return (
            <p key={index} className="whitespace-pre-line">
              <Inline text={block.lines.join("\n")} />
              {isLast ? trailing : null}
            </p>
          );
        }
        const List = block.type === "bullets" ? "ul" : "ol";
        return (
          <List key={index} className={cn("flex flex-col gap-1 pl-5", block.type === "bullets" ? "list-disc" : "list-decimal", "marker:text-subtle-foreground")}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-0.5">
                <Inline text={item} />
                {isLast && itemIndex === block.items.length - 1 ? trailing : null}
              </li>
            ))}
          </List>
        );
      })}
      {blocks.length === 0 ? trailing : null}
    </div>
  );
}

const Caret = () => <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-brand" />;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the text instead.");
    }
  };
  return (
    <Button variant="ghost" size="icon-xs" aria-label={copied ? "Copied" : "Copy answer"} onClick={copy} className="text-subtle-foreground">
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

export function MessageItem({ message }: { message: AssistantMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }
  const checked = [...new Set(message.toolsUsed.map(toolLabel))];
  return (
    <div className="group flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <FormattedText text={message.content} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {checked.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              <Database className="size-2.5" aria-hidden /> {label}
            </span>
          ))}
          <span className="transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <CopyButton text={message.content} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Live answer: real steps from the server, then the streamed text with a caret. */
export function ProgressItem({ progress }: { progress: Progress }) {
  return (
    <div className="flex gap-3 animate-in fade-in duration-300" role="status" aria-live="polite">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-1">
        <ol className="flex flex-col">
          {progress.steps.map((step, index) => {
            const isLast = index === progress.steps.length - 1;
            return (
              <li key={step.id} className="relative flex gap-2.5 pb-4 text-xs last:pb-0 animate-in fade-in slide-in-from-top-1 duration-500">
                {/* Connector to the next step; green once this step is done. */}
                {isLast ? null : (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-4.5 bottom-0.5 left-1.75 w-px transition-colors duration-500",
                      step.done ? "bg-success/50" : "bg-border",
                    )}
                  />
                )}
                <span className="flex size-3.5 shrink-0 items-center justify-center pt-px">
                  {step.done ? (
                    <CircleCheck className="size-3.5 text-success animate-in zoom-in-50 duration-300" aria-hidden />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin text-brand-text" aria-hidden />
                  )}
                </span>
                <span className={cn("leading-4", step.done ? "text-muted-foreground" : "text-shimmer font-medium")}>
                  {step.label}
                  {step.done ? null : "…"}
                </span>
              </li>
            );
          })}
        </ol>
        {progress.text ? (
          <div className="mt-3">
            <FormattedText text={progress.text} trailing={<Caret />} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SUGGESTIONS: { icon: LucideIcon; question: string }[] = [
  { icon: Activity, question: "How is my job search going?" },
  { icon: Trophy, question: "Which jobs are my best matches right now?" },
  { icon: Target, question: "What skills am I missing most often?" },
  { icon: History, question: "What happened recently?" },
];

export function Welcome({ disabled, onPick }: { disabled: boolean; onPick: (question: string) => void }) {
  return (
    <div className="flex flex-col items-center px-1 pt-6 pb-2 text-center animate-in fade-in duration-500">
      <AssistantAvatar size="lg" />
      <h2 className="mt-4 text-base font-semibold">How can I help?</h2>
      <p className="mt-1 max-w-72 text-xs leading-relaxed text-muted-foreground">
        I look up your jobs, match scores, applications and activity to answer. I only read your data; I never change it.
      </p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, question }) => (
          <button
            key={question}
            type="button"
            disabled={disabled}
            onClick={() => onPick(question)}
            className="group flex items-start gap-2.5 rounded-xl border bg-background p-3 text-left text-xs leading-snug transition-colors hover:border-brand hover:bg-brand-soft focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground transition-colors group-hover:text-brand-text" aria-hidden />
            <span>{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
