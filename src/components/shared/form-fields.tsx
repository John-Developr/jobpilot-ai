"use client";

import type { ReactNode } from "react";
import { Controller, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ListTextarea } from "./list-textarea";

/*
 * Thin, typed wrappers that pair a shadcn input with label, description and error.
 * Every field reads its error from the form state, so server-side field errors show too.
 */

interface BaseFieldProps<T extends FieldValues> {
  form: UseFormReturn<T, unknown, T>;
  name: Path<T>;
  label: string;
  description?: ReactNode;
  className?: string;
}

function FieldShell<T extends FieldValues>({
  form,
  name,
  label,
  description,
  className,
  children,
}: BaseFieldProps<T> & { children: ReactNode }) {
  const { error } = form.getFieldState(name, form.formState);
  return (
    <Field data-invalid={Boolean(error)} className={className}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  );
}

const invalid = <T extends FieldValues>(form: UseFormReturn<T, unknown, T>, name: Path<T>) =>
  Boolean(form.getFieldState(name, form.formState).error);

export function TextField<T extends FieldValues>(
  props: BaseFieldProps<T> & { type?: "text" | "email" | "tel" | "url" | "month"; placeholder?: string; autoComplete?: string },
) {
  const { form, name, type = "text", placeholder, autoComplete } = props;
  return (
    <FieldShell {...props}>
      <Input
        id={name}
        type={type}
        placeholder={placeholder ?? (type === "month" ? "YYYY-MM" : undefined)}
        autoComplete={autoComplete}
        aria-invalid={invalid(form, name)}
        {...form.register(name)}
      />
    </FieldShell>
  );
}

export function TextareaField<T extends FieldValues>(
  props: BaseFieldProps<T> & { rows?: number; placeholder?: string },
) {
  const { form, name, rows = 4, placeholder } = props;
  return (
    <FieldShell {...props}>
      <Textarea id={name} rows={rows} placeholder={placeholder} aria-invalid={invalid(form, name)} {...form.register(name)} />
    </FieldShell>
  );
}

/** Number input whose empty value is `null`. */
export function NumberField<T extends FieldValues>(
  props: BaseFieldProps<T> & { step?: number; min?: number; placeholder?: string },
) {
  const { form, name, step = 1, min = 0, placeholder } = props;
  return (
    <FieldShell {...props}>
      <Input
        id={name}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        placeholder={placeholder}
        aria-invalid={invalid(form, name)}
        {...form.register(name, {
          setValueAs: (value: unknown) => (value === "" || value === null ? null : Number(value)),
        })}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Native select. With `nullableNumber`, option values are numbers and "" maps to null.
 */
export function SelectField<T extends FieldValues>(
  props: BaseFieldProps<T> & { options: SelectOption[]; placeholder?: string; nullableNumber?: boolean },
) {
  const { form, name, options, placeholder, nullableNumber } = props;
  return (
    <FieldShell {...props}>
      <NativeSelect
        id={name}
        aria-invalid={invalid(form, name)}
        {...form.register(
          name,
          nullableNumber
            ? { setValueAs: (value: unknown) => (value === "" || value === null ? null : Number(value)) }
            : undefined,
        )}
      >
        {placeholder !== undefined ? <NativeSelectOption value="">{placeholder}</NativeSelectOption> : null}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

export function CheckboxField<T extends FieldValues>({
  form,
  name,
  label,
  description,
}: BaseFieldProps<T>) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal">
          <Checkbox id={name} checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
          <div className="grid gap-0.5">
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
          </div>
        </Field>
      )}
    />
  );
}

/** Edits a string[] field as one-per-line or comma-separated text. */
export function ListField<T extends FieldValues>(
  props: BaseFieldProps<T> & { separator: "line" | "comma"; rows?: number; placeholder?: string },
) {
  const { form, name, separator, rows = separator === "line" ? 4 : 2, placeholder } = props;
  return (
    <FieldShell {...props}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <ListTextarea
            id={name}
            rows={rows}
            separator={separator}
            placeholder={placeholder}
            aria-invalid={invalid(form, name)}
            value={(field.value as string[] | undefined) ?? []}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
    </FieldShell>
  );
}

/** Multi-select rendered as checkbox chips (for small enum sets). */
export function ChipsField<T extends FieldValues>(props: BaseFieldProps<T> & { options: SelectOption[] }) {
  const { form, name, label, description, options } = props;
  const { error } = form.getFieldState(name, form.formState);
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => {
        const selected = (field.value as string[] | undefined) ?? [];
        return (
          <fieldset className="grid gap-2" data-invalid={Boolean(error)}>
            <legend className="mb-2 text-sm font-medium">{label}</legend>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
                >
                  <Checkbox
                    checked={selected.includes(option.value)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked === true
                          ? [...selected, option.value]
                          : selected.filter((value) => value !== option.value),
                      )
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
            <FieldError errors={[error]} />
          </fieldset>
        );
      }}
    />
  );
}

/** Standard footer for dialog/page forms. */
export function FormActions({
  pending,
  onCancel,
  submitLabel = "Save",
  disabled,
}: {
  pending: boolean;
  onCancel?: () => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      ) : null}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
