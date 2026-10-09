import { Select } from "@base-ui/react/select";

interface BaseMultiSelectOption {
  value: string;
  label: string;
  imageSrc?: string;
}

interface BaseMultiSelectProps {
  name: string;
  className?: string;
  options: BaseMultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  showSelectedChipsInTrigger?: boolean;
  showSelectedChipsBelow?: boolean;
}

export function BaseMultiSelect({
  name,
  className = "",
  options,
  selectedValues,
  onChange,
  placeholder = "Select options...",
  showSelectedChipsInTrigger = false,
  showSelectedChipsBelow = true,
}: BaseMultiSelectProps) {
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Select.Root multiple value={selectedValues} onValueChange={onChange}>
        <Select.Trigger className="min-h-11 w-full flex-1 px-3 py-2 border border-harbour-300 bg-white text-left text-harbour-700 flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-harbour-500 data-[popup-open]:border-harbour-500">
          <Select.Value placeholder={placeholder} className="min-w-0 flex-1">
            {(value) =>
              Array.isArray(value) && value.length > 0 ? (
                showSelectedChipsInTrigger ? (
                  <span className="flex flex-wrap gap-1">
                    {options
                      .filter((option) => value.includes(option.value))
                      .map((option) => (
                        <span
                          key={option.value}
                          className="inline-flex max-w-full items-center gap-1 text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-700"
                        >
                          <OptionLabel option={option} />
                        </span>
                      ))}
                  </span>
                ) : (
                  `${value.length} selected`
                )
              ) : (
                placeholder
              )
            }
          </Select.Value>
          <Select.Icon className="shrink-0 text-harbour-400">▼</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            alignItemWithTrigger={false}
            align="start"
            sideOffset={4}
            className="z-50 w-[var(--anchor-width)] max-w-[var(--available-width)]"
          >
            <Select.Popup className="flex max-h-[min(16rem,var(--available-height))] flex-col overflow-hidden border border-harbour-300 bg-white">
              <Select.List className="min-h-0 overflow-y-auto overscroll-contain p-1 [scrollbar-gutter:stable]">
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="px-2 py-1.5 text-sm text-harbour-700 flex items-center justify-between gap-2 cursor-default select-none data-[highlighted]:bg-harbour-100"
                  >
                    <Select.ItemText className="min-w-0 flex-1">
                      <OptionLabel option={option} />
                    </Select.ItemText>
                    <Select.ItemIndicator className="shrink-0 text-harbour-600">
                      ✓
                    </Select.ItemIndicator>
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

      {showSelectedChipsBelow && selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex max-w-full items-center gap-1 text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-700"
            >
              <OptionLabel option={option} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionLabel({ option }: { option: BaseMultiSelectOption }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      {option.imageSrc && (
        <img src={option.imageSrc} alt="" className="w-5 h-5 shrink-0 object-contain" />
      )}
      <span className="truncate">{option.label}</span>
    </span>
  );
}
