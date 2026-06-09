"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  allLabel?: string;
  className?: string;
}

export function Select({
  value,
  onChange,
  options,
  allLabel = "All",
  className = "",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 160 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const display = selected ? selected.label : allLabel;

  function openMenu() {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    setOpen(true);
  }

  return (
    <div ref={wrapperRef} className={`inline-flex ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? "select-options" : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex items-center gap-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-united-red whitespace-nowrap"
      >
        <span className="flex-1 text-left">{display}</span>
        <svg
          className={`w-3 h-3 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              id="select-options"
              style={{
              position: "fixed",
              top: `${menuPos.top + 4}px`,
              left: `${menuPos.left}px`,
              minWidth: `${Math.max(menuPos.width, 160)}px`,
            }}
            className="z-50 bg-united-dark border border-white/10 rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto"
            role="listbox"
          >
            <button
              type="button"
              role="option"
              aria-selected={value === "All"}
              onMouseDown={(e) => { e.preventDefault(); onChange("All"); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/10 ${
                value === "All" ? "text-white" : "text-white/60"
              }`}
            >
              {allLabel}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onMouseDown={(e) => { e.preventDefault(); onChange(opt.value); setOpen(false); }}
                className={`block w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/10 ${
                  value === opt.value ? "text-white" : "text-white/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
