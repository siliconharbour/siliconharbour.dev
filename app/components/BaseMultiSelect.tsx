import { Select } from "@base-ui/react/select";

interface BaseMultiSelectOption {
  value: string;
  label: string;
}

interface BaseMultiSelectProps {
  name: string;
  options: BaseMultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function BaseMultiSelect({
  name,
  options,
  selectedValues,
  onChange,
  placeholder = "Select options...",
}: BaseMultiSelectProps) {
  const selectedOptionLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  return (
    <div className="flex flex-col gap-2">
      <Select.Root
        multiple
        value={selectedValues}
        onValueChange={(next) => onChange(Array.isArray(next) ? (next as string[]) : [])}
      >
        <Select.Trigger className="w-full px-3 py-2 border border-harbour-300 bg-white text-left text-harbour-700 flex items-center justify-between focus:outline-none data-[popup-open]:border-harbour-500">
          <Select.Value placeholder={placeholder}>
            {(value) =>
              Array.isArray(value) && value.length > 0 ? `${value.length} selected` : placeholder
            }
          </Select.Value>
          <Select.Icon className="text-harbour-400">▼</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="z-50">
            <Select.Popup className="w-[var(--anchor-width)] border border-harbour-300 bg-white">
              <Select.List className="max-h-64 overflow-y-auto p-1">
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="px-2 py-1.5 text-sm text-harbour-700 flex items-center justify-between cursor-default select-none data-[highlighted]:bg-harbour-100"
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="text-harbour-600">✓</Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>

      {selectedValues.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      {selectedOptionLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptionLabels.map((label) => (
            <span key={label} className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-700">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
