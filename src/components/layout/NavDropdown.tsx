import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

type DropdownPosition = {
  top: number;
  left: number;
  minWidth: number;
};

function useDropdownPosition(
  isOpen: boolean,
  anchorRef: React.RefObject<HTMLButtonElement | null>
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
        top: rect.bottom + 6,
        left: rect.left,
        minWidth: Math.max(rect.width, 176),
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, isOpen]);

  return position;
}

export function NavDropdown({
  label,
  icon,
  isOpen,
  onToggle,
  onClose,
  active,
  children,
}: {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly active?: boolean;
  readonly children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useDropdownPosition(isOpen, buttonRef);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all',
          active || isOpen
            ? 'bg-white text-[#007ABE] shadow-sm'
            : 'text-blue-50 hover:bg-white/10 hover:text-white'
        )}
      >
        {icon}
        {label}
        <ChevronDown
          size={12}
          className={cn('transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            minWidth: position.minWidth,
          }}
          className="z-[200] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl"
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

export function NavDropdownItem({
  label,
  icon,
  onClick,
  badge,
}: {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly onClick: () => void;
  readonly badge?: number;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
    >
      {icon && <span className="text-slate-400">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
          {badge}
        </span>
      )}
    </button>
  );
}
