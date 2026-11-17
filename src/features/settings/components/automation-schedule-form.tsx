"use client";

import { useTransition } from "react";
import { Controller, useForm, type FieldError as RhfFieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { updateAutomationScheduleAction } from "../server/actions";
import { automationScheduleSchema, WEEKDAY_OPTIONS, type AutomationScheduleInput } from "../schemas";

interface AutomationScheduleFormProps {
  defaultValues: AutomationScheduleInput;
  timezones: string[];
}

export function AutomationScheduleForm({ defaultValues, timezones }: AutomationScheduleFormProps) {
  const [pending, startTransition] = useTransition();
  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<AutomationScheduleInput>({
    resolver: zodResolver(automationScheduleSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateAutomationScheduleAction(values);
      if (result.ok) {
        reset(values);
        toast.success("Automation settings saved.");
        return;
      }
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof AutomationScheduleInput, { message: messages[0] });
      }
      toast.error(result.error);
    });
  });

  const numberField = (
    name: "dailyApplicationLimit" | "minMatchScore" | "maxRetries" | "retryBackoffMinutes",
    label: string,
    description: string,
    error: RhfFieldError | undefined,
  ) => (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        type="number"
        inputMode="numeric"
        aria-invalid={Boolean(error)}
        {...register(name, { valueAsNumber: true })}
      />
      <FieldDescription>{description}</FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Controller
          control={control}
          name="isEnabled"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="isEnabled">Automated submissions</FieldLabel>
                <FieldDescription>
                  When off, nothing is submitted. Discovery and drafting are not affected.
                </FieldDescription>
              </FieldContent>
              <Switch id="isEnabled" checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />

        <FieldSet>
          <FieldLegend variant="label">Working days</FieldLegend>
          <Controller
            control={control}
            name="workingDays"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const checked = field.value.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next === true
                              ? [...field.value, day.value]
                              : field.value.filter((value) => value !== day.value),
                          )
                        }
                      />
                      {day.label}
                    </label>
                  );
                })}
              </div>
            )}
          />
          <FieldError errors={[errors.workingDays]} />
        </FieldSet>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={Boolean(errors.windowStart)}>
            <FieldLabel htmlFor="windowStart">Window opens</FieldLabel>
            <Input id="windowStart" type="time" aria-invalid={Boolean(errors.windowStart)} {...register("windowStart")} />
            <FieldError errors={[errors.windowStart]} />
          </Field>
          <Field data-invalid={Boolean(errors.windowEnd)}>
            <FieldLabel htmlFor="windowEnd">Window closes</FieldLabel>
            <Input id="windowEnd" type="time" aria-invalid={Boolean(errors.windowEnd)} {...register("windowEnd")} />
            <FieldError errors={[errors.windowEnd]} />
          </Field>
          <Field data-invalid={Boolean(errors.timezone)}>
            <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
            <NativeSelect id="timezone" aria-invalid={Boolean(errors.timezone)} {...register("timezone")}>
              {timezones.map((zone) => (
                <NativeSelectOption key={zone} value={zone}>
                  {zone}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError errors={[errors.timezone]} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Submissions are allowed from the opening time up to, but not including, the closing time.
          The server clock decides, not this browser.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {numberField(
            "dailyApplicationLimit",
            "Daily application limit",
            "Maximum submissions per local calendar day.",
            errors.dailyApplicationLimit,
          )}
          {numberField(
            "minMatchScore",
            "Minimum match score",
            "Jobs below this score are never queued automatically.",
            errors.minMatchScore,
          )}
          {numberField("maxRetries", "Max retries", "Retries for a failed automation step.", errors.maxRetries)}
          {numberField(
            "retryBackoffMinutes",
            "Retry backoff (minutes)",
            "Wait time before a failed step is retried.",
            errors.retryBackoffMinutes,
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={!isDirty || pending} onClick={() => reset()}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
