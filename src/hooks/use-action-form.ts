"use client";

import { useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/server/action-result";

interface UseActionFormOptions<T extends FieldValues> {
  schema: z.ZodType<T, T>;
  defaultValues: DefaultValues<T>;
  /** Calls the Server Action with validated values. */
  submit: (values: T) => Promise<ActionResult<unknown>>;
  successMessage?: string;
  onSuccess?: (values: T) => void;
}

/**
 * React Hook Form + Zod + Server Action wiring shared by every form:
 * client validation, pending state, server field errors mapped back to inputs, toasts.
 */
export function useActionForm<T extends FieldValues>({
  schema,
  defaultValues,
  submit,
  successMessage = "Saved.",
  onSuccess,
}: UseActionFormOptions<T>) {
  const [pending, startTransition] = useTransition();
  const form = useForm<T, unknown, T>({ resolver: zodResolver(schema), defaultValues });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await submit(values);
      if (result.ok) {
        form.reset(values);
        toast.success(successMessage);
        onSuccess?.(values);
        return;
      }
      for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
        // Update actions wrap values as { id, values }; map back to the form's field names.
        const field = key.replace(/^values\./, "") as Path<T>;
        form.setError(field, { message: messages[0] });
      }
      toast.error(result.error);
    });
  });

  return { form, onSubmit, pending };
}
