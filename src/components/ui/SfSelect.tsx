import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export type SfSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
};

function normalizeOptions(options: (SfSelectOption | string)[]): SfSelectOption[] {
  return options.map(option =>
    typeof option === 'string' ? { value: option, label: option } : option
  );
}

function useDropdownPosition(
  isOpen: boolean,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  menuMinWidth?: number
) {
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setPosition(null);
      return;
    }

    const update = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, menuMinWidth ?? 0),
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, isOpen, menuMinWidth]);

  return position;
}

export function SfSelect({
  value,
  onChange,
  options,
  disabled,
  className,
  menuMinWidth,
  id,
  'aria-label': ariaLabel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: (SfSelectOption | string)[];
  readonly disabled?: boolean;
  readonly className?: string;
  readonly menuMinWidth?: number;
  readonly id?: string;
  readonly 'aria-label'?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useDropdownPosition(isOpen, buttonRef, menuMinWidth);
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const enabledOptions = useMemo(
    () => normalized.filter(option => !option.disabled),
    [normalized]
  );
  const selected = normalized.find(option => option.value === value);
  const displayLabel = selected?.label ?? value;

  const close = () => {
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    close();
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = enabledOptions.findIndex(option => option.value === value);
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, value, enabledOptions]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
    }

    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        setIsOpen(true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      setHighlightIndex(index => (index + 1) % enabledOptions.length);
    } else if (event.key === 'ArrowUp') {
      setHighlightIndex(index => (index - 1 + enabledOptions.length) % enabledOptions.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const option = enabledOptions[highlightIndex];
      if (option) selectValue(option.value);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen(open => !open)}
        onKeyDown={handleKeyDown}
        className={cn(
          'sf-select-trigger w-full rounded border p-1.5 pr-8 text-left text-xs font-bold outline-none transition-all shadow-sm',
          'border-slate-200 bg-white text-slate-800',
          'hover:border-slate-300 hover:bg-slate-50/60',
          isOpen && 'border-[#007ABE] bg-white ring-[3px] ring-[#007ABE]/14',
          'disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100'
        )}
      >
        <span className="block whitespace-nowrap leading-normal">{displayLabel}</span>
        <ChevronDown
          size={14}
          className={cn(
            'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180 text-[#007ABE]'
          )}
        />
      </button>
      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-activedescendant={
            highlightIndex >= 0 ? `sf-select-option-${enabledOptions[highlightIndex]?.value}` : undefined
          }
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: position.width,
          }}
          className="z-[200] max-h-60 overflow-y-auto rounded-lg border border-slate-200/90 bg-white py-1 shadow-lg shadow-slate-300/30"
        >
          {normalized.map(option => {
            const isSelected = option.value === value;
            const enabledIndex = enabledOptions.findIndex(item => item.value === option.value);
            const isHighlighted = enabledIndex === highlightIndex;

            return (
              <button
                key={option.value}
                id={`sf-select-option-${option.value}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled && enabledIndex >= 0) setHighlightIndex(enabledIndex);
                }}
                onClick={() => !option.disabled && selectValue(option.value)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                  option.disabled
                    ? 'cursor-not-allowed text-slate-300'
                    : isSelected
                      ? 'bg-[#007ABE]/8 font-semibold text-[#007ABE]'
                      : isHighlighted
                        ? 'bg-slate-50 text-slate-800'
                        : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <span className="flex-1 whitespace-nowrap leading-normal">{option.label}</span>
                {isSelected && (
                  <Check size={12} className="shrink-0 text-[#007ABE]" strokeWidth={2.5} />
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
