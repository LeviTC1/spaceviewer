import type { ReactNode } from "react";

export interface SegmentedControlOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<TValue extends string> {
  value: TValue;
  options: Array<SegmentedControlOption<TValue>>;
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
  buttonClassName?: string;
}

const SegmentedControl = <TValue extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  buttonClassName = "",
}: SegmentedControlProps<TValue>) => (
  <div className={`segmented-control ${className}`.trim()} role="group" aria-label={ariaLabel}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          className={`segmented-control__button ${buttonClassName} ${active ? "active" : ""}`.trim()}
          onClick={() => onChange(option.value)}
          aria-label={option.ariaLabel}
          aria-pressed={active}
          disabled={option.disabled}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;
