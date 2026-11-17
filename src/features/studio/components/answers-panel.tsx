"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Loader2, Plus, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeleteButton } from "@/components/shared/delete-button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  createAnswerAction,
  deleteAnswerAction,
  generateAnswerAction,
  updateAnswerAction,
} from "../server/actions";
import type { StudioAnswer } from "../server/studio-repository";

export function AnswersPanel({ applicationId, answers, aiReady }: { applicationId: string; answers: StudioAnswer[]; aiReady: boolean }) {
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const result = await createAnswerAction({ applicationId, question });
      if (!result.ok) return void toast.error(result.fieldErrors?.question?.[0] ?? result.error);
      setQuestion("");
      toast.success("Question added.");
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Paste each screening question from the application form. Drafts use only your verified profile and start
        unverified; automation will only ever submit answers you mark as verified.
      </p>
      {answers.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="No screening questions yet" description="Add the questions the application form asks." />
      ) : (
        <ul className="flex flex-col gap-3">
          {answers.map((answer) => (
            <li key={`${answer.id}-${answer.answer.length}-${answer.isVerified}`}>
              <AnswerItem answer={answer} aiReady={aiReady} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="new-question" className="text-xs">
            New question
          </Label>
          <Textarea
            id="new-question"
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. Why do you want to work at Acme?"
            maxLength={2000}
          />
        </div>
        <Button variant="outline" onClick={add} disabled={pending || !question.trim()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add question
        </Button>
      </div>
    </div>
  );
}

function AnswerItem({ answer, aiReady }: { answer: StudioAnswer; aiReady: boolean }) {
  const [text, setText] = useState(answer.answer);
  const [verified, setVerified] = useState(answer.isVerified);
  const [pending, startTransition] = useTransition();
  const dirty = text !== answer.answer || verified !== answer.isVerified;

  const save = () =>
    startTransition(async () => {
      const result = await updateAnswerAction({
        id: answer.id,
        values: { question: answer.question, answer: text, isVerified: verified },
      });
      if (!result.ok) return void toast.error(result.fieldErrors?.["answer"]?.[0] ?? result.error);
      toast.success(verified ? "Answer saved and verified." : "Answer saved.");
    });

  const draft = () =>
    startTransition(async () => {
      const result = await generateAnswerAction({ id: answer.id });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Draft ready (${result.data.confidence} confidence). Review it, then verify.`);
      if (result.data.needsUserInput) toast.warning(`You need to add: ${result.data.needsUserInput}`);
    });

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-start gap-2">
        <p className="flex-1 text-sm font-medium whitespace-pre-line">{answer.question}</p>
        <span
          className={
            answer.isVerified
              ? "rounded-md bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success"
              : "rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning"
          }
        >
          {answer.isVerified ? "Verified" : "Unverified"}
        </span>
        <DeleteButton itemLabel="this question" onDelete={() => deleteAnswerAction({ id: answer.id })} />
      </div>
      <Textarea
        aria-label={`Answer to: ${answer.question}`}
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write your answer, or draft one with AI."
        maxLength={10_000}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={verified} onCheckedChange={(checked) => setVerified(checked === true)} disabled={!text.trim()} />
          I confirm this answer is accurate
        </label>
        <div className="flex gap-2">
          {aiReady ? (
            <Button variant="ghost" size="sm" onClick={draft} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {answer.answer ? "Redraft" : "Draft with AI"}
            </Button>
          ) : null}
          <Button size="sm" onClick={save} disabled={pending || !dirty}>
            <Save aria-hidden /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}
