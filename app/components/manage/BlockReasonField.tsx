import type { InputHTMLAttributes } from "react";

export function BlockReasonField(
  props: Pick<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">,
) {
  return (
    <label className="flex flex-col gap-gap-1 text-sm text-body">
      Reason (optional)
      <input
        name="reason"
        maxLength={2000}
        className="border border-line bg-surface px-pad-3 py-pad-2"
        {...props}
      />
    </label>
  );
}
