"use client";

import { useState, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";

interface ListTextareaProps extends Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> {
  value: string[];
  onChange: (value: string[]) => void;
  /** "line": one item per line. "comma": comma-separated. */
  separator: "line" | "comma";
}

const SPLIT = { line: /\r?\n/, comma: /,/ } as const;
const JOIN = { line: "\n", comma: ", " } as const;

/**
 * Edits a string[] as free text. Keeps the raw text locally so typing a trailing
 * newline or comma is not swallowed; emits the cleaned list on every change.
 */
export function ListTextarea({ value, onChange, separator, ...props }: ListTextareaProps) {
  const [text, setText] = useState(() => value.join(JOIN[separator]));

  return (
    <Textarea
      {...props}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(SPLIT[separator])
            .map((item) => item.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
