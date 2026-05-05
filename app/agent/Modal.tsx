"use client";

import { useEffect, type PropsWithChildren } from "react";

export function Modal({
  title,
  onClose,
  children,
}: PropsWithChildren<{ title: string; onClose: () => void }>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card relative w-full max-w-md overflow-hidden p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-highlight" />
        <div className="relative z-10 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-medium tracking-tight text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              esc
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormError({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-300">
      {text}
    </p>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  hint,
  step = "0.01",
  min = "0",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-zinc-300/40"
      />
      {hint && <p className="font-mono text-[10px] text-zinc-500">{hint}</p>}
    </label>
  );
}
