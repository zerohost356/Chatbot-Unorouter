"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ModelInfo } from "@/lib/types";
import { friendlyModelName } from "@/lib/chat";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
  ZapIcon,
} from "@/components/ui/icons";
import { copyText, formatCompact } from "@/lib/utils";

interface ModelPickerProps {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  mode: "live" | "demo";
  align?: "left" | "right";
}

function formatContext(n?: number): string {
  if (!n || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : Number(m.toFixed(m % 1 === 0 ? 0 : 1))}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function formatPrice(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "Free";
  if (v < 0.000001) return "<$0.000001";
  if (v < 0.01) return `$${v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (v < 1) return `$${v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${v.toFixed(2)}`;
}

function useIsMobile(breakpoint = 760): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setMobile(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

function ModelStats({ model, compact = false }: { model: ModelInfo; compact?: boolean }) {
  const rows = [
    { label: "Context", value: formatContext(model.context), show: model.context != null },
    { label: "Max output", value: formatContext(model.maxOutput), show: model.maxOutput != null },
    { label: "Input / 1M", value: formatPrice(model.inputPrice), show: model.inputPrice != null },
    { label: "Output / 1M", value: formatPrice(model.outputPrice), show: model.outputPrice != null },
  ].filter((r) => r.show);

  return (
    <div className={`model-stats${compact ? " is-compact" : ""}`}>
      <div className="model-stat">
        <span className="model-stat-label">Provider</span>
        <span className="model-stat-value">{model.vendor}</span>
      </div>
      {rows.map((r) => (
        <div className="model-stat" key={r.label}>
          <span className="model-stat-label">{r.label}</span>
          <span className="model-stat-value">{r.value}</span>
        </div>
      ))}
      <div className="model-stat">
        <span className="model-stat-label">Vision</span>
        <span className={`model-stat-value ${model.vision ? "is-on" : "is-off"}`}>{model.vision ? "Yes" : "No"}</span>
      </div>
      <div className="model-stat">
        <span className="model-stat-label">Reasoning</span>
        <span className={`model-stat-value ${model.reasoning ? "is-on" : "is-off"}`}>{model.reasoning ? "Yes" : "No"}</span>
      </div>
      <div className="model-stat">
        <span className="model-stat-label">Pricing</span>
        <span className={`model-stat-value ${model.free || model.inputPrice === 0 ? "is-on" : ""}`}>
          {model.free || model.inputPrice === 0 ? "Free" : model.inputPrice != null ? "Paid / usage" : "—"}
        </span>
      </div>
      <div className="model-stat">
        <span className="model-stat-label">Status</span>
        <span className={`model-stat-value ${model.available === false ? "is-off" : "is-on"}`}>
          {model.available === false ? "Unavailable" : "Available"}
        </span>
      </div>
    </div>
  );
}

export default function ModelPicker({ models, value, onChange, mode, align = "left" }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobile = useIsMobile(760);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (mobile) return;
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, mobile]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopiedId(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (model) =>
        model.name.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        model.vendor.toLowerCase().includes(q) ||
        (model.description || "").toLowerCase().includes(q),
    );
  }, [models, query]);

  const selected = models.find((model) => model.id === value);
  const label = selected?.name ?? friendlyModelName(value, models);

  const copyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(id);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1400);
    }
  };

  const panel = open ? (
    <div className={`model-sheet${mobile ? " is-mobile" : ` is-desktop${align === "right" ? " align-right" : ""}`}`} role="dialog" aria-label="Select model">
      {mobile ? <button type="button" className="model-sheet-backdrop" aria-label="Close model picker" onClick={() => setOpen(false)} /> : null}
      <div className="model-menu model-menu-rich" role="listbox" aria-label="Models">
        <div className="model-menu-head">
          <span className="model-menu-title">
            <ZapIcon size={14} /> Select model
          </span>
          <div className="model-menu-head-right">
            <span className={`mode-badge mode-${mode}`}>{mode === "live" ? "UnoRouter" : "Demo"}</span>
            <button type="button" className="icon-btn subtle model-close-btn" onClick={() => setOpen(false)} aria-label="Close">
              <XIcon size={15} />
            </button>
          </div>
        </div>

        {selected ? (
          <div className="model-selected-card">
            <div className="model-selected-top">
              <span className="model-selected-kicker"><SparklesIcon size={12} /> Current</span>
              <span className="model-id-badge" title={selected.id}>{selected.id}</span>
            </div>
            <div className="model-selected-name">{selected.name}</div>
            <ModelStats model={selected} compact />
          </div>
        ) : null}

        <div className="model-search">
          <SearchIcon size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, id, provider..."
            aria-label="Filter models"
          />
        </div>
        <div className="model-list-meta">
          <span>{filtered.length} / {models.length} models</span>
          <span className="model-list-hint">Full stats shown per model</span>
        </div>
        <div className="model-list model-list-rich">
          {filtered.length === 0 ? <p className="model-empty">No matching model.</p> : null}
          {filtered.map((model) => {
            const active = model.id === value;
            return (
              <button
                type="button"
                key={model.id}
                className={`model-item model-item-rich${active ? " is-active" : ""}`}
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
              >
                <div className="model-item-top">
                  <span className="model-item-main">
                    <span className="model-item-name">
                      {model.name}
                      {model.recommended ? <span className="model-rec">Recommended</span> : null}
                      {model.free || model.inputPrice === 0 ? <span className="model-rec model-rec-free">Free</span> : null}
                    </span>
                    <span className="model-item-idline">
                      <code className="model-item-id">{model.id}</code>
                      <span
                        role="button"
                        tabIndex={0}
                        className="model-copy-id"
                        onClick={(e) => void copyId(model.id, e)}
                        onKeyDown={(e) => { if (e.key === "Enter") void copyId(model.id, e as any); }}
                        aria-label={`Copy model id ${model.id}`}
                        title="Copy model id"
                      >
                        {copiedId === model.id ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                      </span>
                    </span>
                  </span>
                  <span className="model-item-flags">
                    {model.vision ? <span className="flag flag-vision">Vision</span> : null}
                    {model.reasoning ? <span className="flag flag-reason">Reasoning</span> : null}
                    {active ? <CheckIcon size={16} className="model-check" /> : null}
                  </span>
                </div>
                {model.description ? <p className="model-item-desc">{model.description}</p> : null}
                <ModelStats model={model} compact />
              </button>
            );
          })}
        </div>
        <p className="model-foot">
          All available UnoRouter models. Choose per conversation; reasoning trace shows when supported.
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className={`model-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose a model"
      >
        <span className="model-trigger-icon">
          <SparklesIcon size={14} />
        </span>
        <span className="model-trigger-text">
          <span className="model-trigger-name">{label}</span>
          <span className="model-trigger-meta">
            {selected?.reasoning ? "Reasoning" : selected?.vision ? "Vision" : mode === "live" ? "Live" : "Demo"}
            {selected?.context ? ` · ${formatContext(selected.context)}` : ""}
          </span>
        </span>
        <ChevronDownIcon size={14} className="model-chevron" />
      </button>

      {mounted && open ? (mobile ? createPortal(panel, document.body) : panel) : null}
    </div>
  );
}
