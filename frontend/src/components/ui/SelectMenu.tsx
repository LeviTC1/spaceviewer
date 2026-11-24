import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SelectMenuOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectMenuProps<TValue extends string> {
  label: string;
  value: TValue;
  options: Array<SelectMenuOption<TValue>>;
  onChange: (value: TValue) => void;
  className?: string;
  labelClassName?: string;
  triggerClassName?: string;
  caretClassName?: string;
  menuClassName?: string;
  itemClassName?: string;
  onOpenStart?: () => void;
}

const getOptionText = (label: ReactNode) => (typeof label === "string" || typeof label === "number" ? String(label) : "");

const SelectMenu = <TValue extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
  labelClassName = "",
  triggerClassName = "",
  caretClassName = "",
  menuClassName = "",
  itemClassName = "",
  onOpenStart,
}: SelectMenuProps<TValue>) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const openRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const menuId = useId();
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const currentOption = options[currentIndex] ?? options[0];
  const activeOption = options[activeIndex] ?? currentOption;

  const enabledIndexes = useMemo(
    () => options.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0),
    [options],
  );

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) {
        // Claim this Escape so page-level shortcuts (e.g. Solar clean-map)
        // don't also fire while the user is just closing the dropdown.
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(currentIndex);
    }
  }, [currentIndex, open]);

  const moveActive = (direction: 1 | -1) => {
    if (!enabledIndexes.length) return;
    const currentEnabledIndex = enabledIndexes.indexOf(activeIndex);
    const safeCurrent = currentEnabledIndex >= 0 ? currentEnabledIndex : enabledIndexes.indexOf(currentIndex);
    const nextEnabledIndex =
      direction === 1
        ? (Math.max(0, safeCurrent) + 1) % enabledIndexes.length
        : (safeCurrent - 1 + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextEnabledIndex]);
  };

  const chooseOption = (option: SelectMenuOption<TValue>) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const openMenu = () => {
    onOpenStart?.();
    setOpen(true);
  };

  const toggleMenu = () => {
    if (!open) {
      onOpenStart?.();
    }
    setOpen((prev) => !prev);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && activeOption) {
        chooseOption(activeOption);
        return;
      }
      openMenu();
    }
  };

  return (
    <div className={["select-menu", className, open ? "is-open" : ""].filter(Boolean).join(" ")} ref={wrapperRef}>
      <span className={`select-menu__label ${labelClassName}`.trim()} id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className={`select-menu__trigger ${triggerClassName} ${open ? "open" : ""}`.trim()}
        onClick={toggleMenu}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${menuId}-trigger`}
        aria-controls={menuId}
      >
        <span id={`${menuId}-trigger`}>{currentOption?.label ?? "Select"}</span>
        <span className={`select-menu__caret ${caretClassName}`.trim()} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={`select-menu__menu ${menuClassName}`.trim()} role="listbox" id={menuId} aria-labelledby={labelId}>
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                className={`select-menu__item ${itemClassName} ${selected ? "active" : ""} ${active ? "is-highlighted" : ""}`.trim()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                title={getOptionText(option.label)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SelectMenu;
