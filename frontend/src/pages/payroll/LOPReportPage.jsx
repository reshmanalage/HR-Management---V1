import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import {
  calculateLOP,
  deleteCycleAttendance,
  getAttendanceReport,
  overrideDeduction,
  revertDeductionOverride,
} from "../../services/payrollService";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────
function currentCycleStart() {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();
  if (today.getDate() < 21) {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-21`;
}
function formatMins(minutes) {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
const formatOT = formatMins;
function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m > 0 ? m + "m" : ""}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  P:  { label: "Present",  cls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  A:  { label: "Absent",   cls: "bg-red-100 text-red-700",         dot: "bg-red-500"     },
  WO: { label: "Week Off", cls: "bg-slate-100 text-slate-500",     dot: "bg-slate-400"   },
  H:  { label: "Holiday",  cls: "bg-blue-100 text-blue-700",       dot: "bg-blue-500"    },
  LV: { label: "Leave",    cls: "bg-violet-100 text-violet-700",   dot: "bg-violet-500"  },
};
const DED_TYPE_LABELS = {
  late_arrival:   "Late Arrival",
  early_leaving:  "Early Leaving",
  grace_exceeded: "Grace Exceeded",
  absence:        "Absent",
  leave_lop:      "Leave LOP",
  leave_double:   "Penalty 2×",
};
const DEDUCTION_MODES = [
  { value: "actual_hours", label: "Actual Hours" },
  { value: "penalty",      label: "Penalty Tier" },
  { value: "custom",       label: "Custom"        },
];

// ─────────────────────────────────────────────────────────────────────────────
// Design system — 4-tier attendance color scale
// ─────────────────────────────────────────────────────────────────────────────
function attColor(pct) {
  if (pct >= 90) return { bar: "bg-emerald-500", text: "text-emerald-600", ring: "#10b981", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", left: "border-l-emerald-400" };
  if (pct >= 75) return { bar: "bg-amber-400",   text: "text-amber-600",   ring: "#f59e0b", badge: "bg-amber-50 text-amber-700 border-amber-200",       left: "border-l-amber-400"   };
  if (pct >= 60) return { bar: "bg-orange-400",  text: "text-orange-600",  ring: "#f97316", badge: "bg-orange-50 text-orange-700 border-orange-200",     left: "border-l-orange-400"  };
  return           { bar: "bg-red-500",       text: "text-red-600",     ring: "#ef4444", badge: "bg-red-50 text-red-700 border-red-200",             left: "border-l-red-400"     };
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar helpers
// ─────────────────────────────────────────────────────────────────────────────
function nameInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}
function nameColorClass(name = "") {
  const palette = ["bg-indigo-500","bg-violet-500","bg-pink-500","bg-teal-500","bg-sky-500","bg-rose-500","bg-amber-500","bg-emerald-500"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return palette[h % palette.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon helper
// ─────────────────────────────────────────────────────────────────────────────
const P = {
  users:    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  check:    "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  check2:   "M5 13l4 4L19 7",
  clock:    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  minus:    "M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
  lightning:"M13 10V3L4 14h7v7l9-11h-7z",
  edit:     "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  revert:   "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",
  warn:     "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  trash:    "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  refresh:  "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  report:   "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  chevD:    "M19 9l-7 7-7-7",
  xsm:      "M6 18L18 6M6 6l12 12",
  search:   "M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z",
  override: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  percent:  "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  late:     "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  early:    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  info:     "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  filter:   "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z",
};
function Ico({ d, className = "w-4 h-4", title }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      {title && <title>{title}</title>}
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — with optional trend line
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color, iconBg, iconColor, alert, trend }) {
  return (
    <div
      role="article"
      aria-label={`${label}: ${value}`}
      className={`bg-white rounded-xl border px-4 py-3.5 flex items-start gap-3 hover:shadow-md transition-all duration-200 cursor-default ${
        alert ? "border-amber-200 bg-amber-50/20" : "border-slate-200"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Ico d={icon} className={`w-4.5 h-4.5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[22px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
        <p className="text-[11px] font-semibold text-slate-400 mt-1.5 uppercase tracking-wide leading-none">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-1 leading-tight">{sub}</p>}
        {trend && (
          <p className={`text-[10px] mt-1.5 font-semibold flex items-center gap-0.5 ${trend.up ? "text-emerald-600" : "text-slate-400"}`}>
            {trend.up ? "↑" : "↓"} {trend.text}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }) {
  const meta = STATUS_STYLES[status] || { label: status, cls: "bg-slate-100 text-slate-500", dot: "bg-slate-400" };
  const pad  = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${pad} ${meta.cls}`}
      title={meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance ring — uses 4-tier color scale
// ─────────────────────────────────────────────────────────────────────────────
function AttRing({ pct, size = 46 }) {
  const { ring } = attColor(pct);
  const r    = (size - 7) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Attendance ${pct}%`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ring} strokeWidth={5}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - Math.min(100, Math.max(0, pct)) / 100)}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)" }}
      />
      <text x={size/2} y={size/2 + 4.5} textAnchor="middle" fontSize={10} fontWeight={800} fill={ring} letterSpacing="-0.5">{pct}%</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirmation dialog
// ─────────────────────────────────────────────────────────────────────────────
function DeleteDialog({ open, cycleStart, cycleEnd, onConfirm, onCancel, deleting }) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) { setTyped(""); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [open]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="del-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onKeyDown={e => e.key === "Escape" && onCancel()}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Ico d={P.trash} className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 id="del-title" className="text-base font-bold text-red-700">Delete Cycle Data</h3>
            <p className="text-xs text-red-400 mt-0.5">This action is permanent and cannot be undone</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            You are about to permanently delete <strong className="text-slate-800">all attendance records and LOP deductions</strong> for:
          </p>
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <Ico d={P.calendar} className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 tabular-nums font-mono">{cycleStart} → {cycleEnd}</span>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <p className="text-xs text-red-600 leading-relaxed flex items-start gap-1.5">
              <Ico d={P.warn} className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              All attendance, LOP deductions, and manual overrides for this cycle will be permanently removed.
            </p>
          </div>
          <div>
            <label htmlFor="del-confirm" className="block text-xs font-semibold text-slate-600 mb-2">
              Type <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-red-600 text-[11px] mx-0.5">DELETE</code> to confirm
            </label>
            <input ref={inputRef} id="del-confirm" type="text" value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="Type DELETE here…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              onKeyDown={e => e.key === "Enter" && typed === "DELETE" && onConfirm()}
            />
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={typed !== "DELETE" || deleting}
            className="inline-flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-all"
          >
            {deleting
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deleting…</>
              : <><Ico d={P.trash} className="w-3.5 h-3.5" /> Delete Permanently</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success / info toast
// ─────────────────────────────────────────────────────────────────────────────
function SuccessToast({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div role="alert" aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl max-w-sm border border-slate-700"
      style={{ animation: "slideUp 0.25s ease" }}
    >
      <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
        <Ico d={P.check2} className="w-3.5 h-3.5 text-white" />
      </div>
      <p className="text-sm flex-1 leading-snug">{msg}</p>
      <button onClick={onClose} aria-label="Dismiss notification" className="text-slate-400 hover:text-white transition-colors ml-1">
        <Ico d={P.xsm} className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loaders
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonKpi() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-5 bg-slate-200 rounded w-12" />
          <div className="h-2.5 bg-slate-100 rounded w-20" />
        </div>
      </div>
    </div>
  );
}
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-slate-200 overflow-hidden animate-pulse">
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3.5 bg-slate-200 rounded w-48" />
            <div className="h-2.5 bg-slate-100 rounded w-28" />
            <div className="h-1.5 bg-slate-100 rounded-full w-full mt-3" />
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-100 shrink-0" />
        </div>
        <div className="flex gap-2 mt-3 ml-[60px]">
          {Array.from({length:6}).map((_,i) => <div key={i} className="h-10 w-16 bg-slate-100 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduction Cell — ALL business logic UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────
function DeductionCell({ day, empId, cycleStart, canEdit, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode]       = useState("penalty");
  const [days, setDays]       = useState("");
  const [reason, setReason]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  function preValueFor(m) {
    if (m === "actual_hours") return String(day.deduction_actual_hours ?? 0);
    if (m === "penalty")      return String(day.deduction_penalty ?? 0);
    return days;
  }
  function handleModeChange(m) {
    setMode(m);
    if (m !== "custom") setDays(preValueFor(m));
  }
  async function handleSave() {
    if (!reason.trim()) { setErr("Reason is required"); return; }
    const val = parseFloat(days);
    if (isNaN(val) || val < 0 || val > 3) { setErr("Enter 0 – 3 days"); return; }
    setSaving(true); setErr("");
    const modeLabel = DEDUCTION_MODES.find(m => m.value === mode)?.label ?? mode;
    try {
      await overrideDeduction({
        employee_id: empId,
        cycle_start: cycleStart,
        date: day.date,
        deduction_days: val,
        reason: `[${modeLabel}] ${reason.trim()}`,
      });
      setEditing(false);
      onRefresh();
    } catch (e) {
      setErr(e.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  }
  async function handleRevert() {
    setSaving(true);
    try {
      await revertDeductionOverride({ employee_id: empId, cycle_start: cycleStart, date: day.date });
      onRefresh();
    } catch (e) {
      setErr(e.response?.data?.detail || "Revert failed");
    } finally { setSaving(false); }
  }
  function openEditor() {
    const initMode = "penalty";
    setMode(initMode);
    setDays(preValueFor(initMode));
    setReason(""); setErr(""); setEditing(true);
  }

  const modal = editing ? createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setEditing(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-80 p-5 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Override Deduction</p>
          <button onClick={() => setEditing(false)} className="text-slate-300 hover:text-slate-600 transition-colors" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex gap-1">
          {DEDUCTION_MODES.map(opt => (
            <button key={opt.value} type="button" onClick={() => handleModeChange(opt.value)}
              className={`flex-1 text-[11px] px-2 py-1.5 rounded-lg border font-semibold transition-all ${
                mode === opt.value ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:border-indigo-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-2">
          <span>Actual: <strong className="text-slate-700">{day.deduction_actual_hours > 0 ? `${day.deduction_actual_hours.toFixed(3)}d` : "—"}</strong></span>
          <span>Penalty: <strong className="text-slate-700">{day.deduction_penalty > 0 ? `${day.deduction_penalty.toFixed(3)}d` : "—"}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" step="0.001" min="0" max="3" value={days}
            onChange={e => { setMode("custom"); setDays(e.target.value); }}
            className="w-28 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Deduction days"
            autoFocus
          />
          <span className="text-xs text-slate-400">days deducted</span>
        </div>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Reason (required)"
          aria-label="Override reason"
        />
        {err && (
          <p className="text-[11px] text-red-500 flex items-center gap-1">
            <Ico d={P.warn} className="w-3 h-3 shrink-0" />{err}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 text-[12px] bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-semibold transition-colors"
          >
            {saving ? "Saving…" : "Apply Override"}
          </button>
          <button onClick={() => setEditing(false)}
            className="text-[12px] text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="flex items-center gap-1.5 group/ded">
      {modal}
      {day.deduction_days > 0 ? (
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[12px] font-bold tabular-nums ${day.has_manual_override ? "text-violet-700" : "text-red-600"}`}
            title={day.has_manual_override ? "Manual override applied" : "System-calculated deduction"}
          >
            {day.deduction_days.toFixed(2)}d
          </span>
          {day.has_manual_override && (
            <span className="text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full border border-violet-100 leading-none">
              Manual
            </span>
          )}
        </div>
      ) : (
        <span className="text-slate-200 text-sm">—</span>
      )}
      {canEdit && (day.status === "P" || day.deduction_days > 0) && (
        <div className="hidden group-hover/ded:flex items-center gap-0.5">
          <button onClick={openEditor} title="Override deduction" aria-label="Override deduction"
            className="w-6 h-6 rounded-md text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all"
          >
            <Ico d={P.edit} className="w-3.5 h-3.5" />
          </button>
          {day.has_manual_override && (
            <button onClick={handleRevert} disabled={saving} title="Revert to system calculation" aria-label="Revert override"
              className="w-6 h-6 rounded-md text-slate-300 hover:text-orange-500 hover:bg-orange-50 flex items-center justify-center transition-all disabled:opacity-40"
            >
              <Ico d={P.revert} className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Day row background
// ─────────────────────────────────────────────────────────────────────────────
function dayRowCls(day, idx) {
  const base = idx % 2 === 1 ? "bg-slate-50/40" : "bg-white";
  if (day.is_holiday)          return `${base} hover:bg-blue-50/60`;
  if (day.status === "WO")     return "bg-slate-50/70 hover:bg-slate-100/70";
  if (day.status === "A")      return "bg-red-50/30 hover:bg-red-50/50";
  if (day.status === "LV")     return "bg-violet-50/30 hover:bg-violet-50/50";
  if (day.has_manual_override) return "bg-amber-50/25 hover:bg-amber-50/40";
  return `${base} hover:bg-indigo-50/20`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee summary strip — shown above the daily table
// ─────────────────────────────────────────────────────────────────────────────
function EmployeeSummaryStrip({ emp }) {
  const workedMins = useMemo(
    () => emp.days.reduce((s, d) => s + (d.working_minutes || 0), 0),
    [emp.days]
  );
  const lateCount  = useMemo(() => emp.days.filter(d => d.late_by_minutes > 0).length,  [emp.days]);
  const earlyCount = useMemo(() => emp.days.filter(d => d.early_by_minutes > 0).length, [emp.days]);

  const items = [
    { icon: P.clock,     label: "Worked Hours",  value: formatDuration(workedMins) || "—",   color: "text-slate-700"  },
    { icon: P.lightning, label: "OT Hours",      value: emp.total_ot_hours > 0 ? `${emp.total_ot_hours.toFixed(1)}h` : "—", color: emp.total_ot_hours > 0 ? "text-indigo-600" : "text-slate-300" },
    { icon: P.late,      label: "Late Arrivals", value: lateCount  > 0 ? lateCount  : "—",  color: lateCount  > 0 ? "text-orange-600" : "text-slate-300" },
    { icon: P.early,     label: "Early Exits",   value: earlyCount > 0 ? earlyCount : "—",  color: earlyCount > 0 ? "text-amber-600"  : "text-slate-300" },
    { icon: P.minus,     label: "LOP Days",      value: emp.total_deduction_days > 0 ? `${emp.total_deduction_days.toFixed(2)}d` : "—", color: emp.total_deduction_days > 0 ? "text-red-600" : "text-slate-300" },
    { icon: P.override,  label: "Overrides",     value: emp.days.filter(d => d.has_manual_override).length || "—", color: emp.days.some(d => d.has_manual_override) ? "text-violet-600" : "text-slate-300" },
  ];

  return (
    <div className="bg-white border-b border-slate-100 px-5 py-3">
      <div className="flex items-stretch gap-0 divide-x divide-slate-100 flex-wrap">
        {items.map((item, i) => (
          <div key={item.label} className={`flex flex-col items-start px-4 py-1 first:pl-0 ${i === 0 ? "" : ""}`}>
            <span className={`text-[15px] font-bold tabular-nums leading-none ${item.color}`}>{item.value}</span>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-1.5 flex items-center gap-1 whitespace-nowrap">
              <Ico d={item.icon} className="w-3 h-3 text-slate-300" />
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expanded employee detail — tabbed (4 tabs)
// ─────────────────────────────────────────────────────────────────────────────
const TAB_DEFS = [
  { key: "attendance", label: "Attendance" },
  { key: "ot",         label: "OT Details" },
  { key: "lop",        label: "LOP & Deductions" },
  { key: "overrides",  label: "Manual Overrides" },
];

function ExpandedDetail({ emp, cycleStart, canEdit, onRefresh }) {
  const [tab, setTab] = useState("attendance");

  const otDays        = useMemo(() => emp.days.filter(d => d.ot_minutes > 0),          [emp.days]);
  const lopDays       = useMemo(() => emp.days.filter(d => d.deduction_days > 0),      [emp.days]);
  const overrideDays  = useMemo(() => emp.days.filter(d => d.has_manual_override),     [emp.days]);
  const counts        = { attendance: emp.days.length, ot: otDays.length, lop: lopDays.length, overrides: overrideDays.length };
  const rows          = tab === "ot" ? otDays : tab === "lop" ? lopDays : tab === "overrides" ? overrideDays : emp.days;

  const tabAlert = { lop: lopDays.length > 0, overrides: overrideDays.length > 0 };

  return (
    <div className="border-t border-slate-100">
      {/* Summary strip */}
      <EmployeeSummaryStrip emp={emp} />

      {/* Tab bar */}
      <div className="flex items-end gap-0.5 px-5 pt-2 pb-0 bg-white border-b border-slate-200">
        {TAB_DEFS.map(({ key, label }) => {
          const active = tab === key;
          const cnt    = counts[key];
          const alert  = tabAlert[key];
          return (
            <button key={key} onClick={() => setTab(key)} role="tab" aria-selected={active}
              className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-semibold rounded-t-lg transition-all border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                active
                  ? "border-indigo-600 text-indigo-700 bg-indigo-50/40"
                  : "border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label}
              {cnt > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                  active
                    ? "bg-indigo-100 text-indigo-700"
                    : alert
                    ? "bg-red-100 text-red-600"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {cnt}
                </span>
              )}
              {alert && !active && cnt > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400" />
              )}
            </button>
          );
        })}

        {canEdit && (
          <div className="ml-auto mb-1 flex items-center gap-1.5 text-[11px] text-violet-600 bg-violet-50 border border-violet-100 px-2.5 py-1.5 rounded-lg">
            <Ico d={P.edit} className="w-3 h-3" />
            Hover a deduction cell to override
          </div>
        )}
      </div>

      {/* Table or empty */}
      {rows.length === 0 ? (
        <div className="py-12 text-center bg-slate-50/40">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Ico d={P.report} className="w-5 h-5 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-400">No {TAB_DEFS.find(t => t.key === tab)?.label.toLowerCase()} records this cycle</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-slate-50/30">
          <table className="min-w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200">
                {["Date","Day","Status","In Time","Out Time","Duration","Late By","Early By","OT","Deduction","Reason"].map((h, i) => (
                  <th key={h}
                    className={`py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-200 ${
                      i === 0
                        ? "sticky left-0 z-10 bg-slate-100/90 px-4 text-left"
                        : "px-3 text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((day, idx) => (
                <tr key={day.date} className={`transition-colors border-b border-slate-100/80 ${dayRowCls(day, idx)}`}>
                  {/* Frozen date column */}
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 whitespace-nowrap border-r border-slate-100">
                    <div>
                      <span className="font-mono text-[11px] font-semibold text-slate-700">{day.date}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-[11px] font-medium">{day.day_name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={day.status} size="xs" />
                      {day.is_holiday && day.holiday_name && (
                        <span className="text-[10px] text-blue-500 italic font-medium">{day.holiday_name}</span>
                      )}
                      {day.has_manual_override && (
                        <span className="text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 rounded border border-violet-100" title="Manual override applied">MO</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">
                    {day.in_time
                      ? <span className="text-emerald-700 font-bold">{day.in_time}</span>
                      : day.status === "P"
                      ? <span className="text-red-400 font-semibold">Missing</span>
                      : <span className="text-slate-200">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">
                    {day.out_time
                      ? <span className="text-slate-600 font-semibold">{day.out_time}</span>
                      : day.status === "P"
                      ? <span className="text-red-400 font-semibold">Missing</span>
                      : <span className="text-slate-200">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-600 font-semibold tabular-nums">
                    {formatDuration(day.working_minutes) || <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {day.late_by_minutes > 0
                      ? <span title={`Late by ${formatMins(day.late_by_minutes)}`} className="inline-flex items-center gap-1 text-orange-600 font-bold bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full text-[10px]">
                          <span className="w-1 h-1 rounded-full bg-orange-400 shrink-0" />{formatMins(day.late_by_minutes)}
                        </span>
                      : day.status === "P"
                      ? <span className="text-emerald-400 text-[11px] font-medium">On time</span>
                      : <span className="text-slate-200">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    {day.early_by_minutes > 0
                      ? <span title={`Left early by ${formatMins(day.early_by_minutes)}`} className="inline-flex items-center gap-1 text-amber-600 font-bold bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                          <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />{formatMins(day.early_by_minutes)}
                        </span>
                      : day.status === "P"
                      ? <span className="text-emerald-400 text-[11px] font-medium">Full day</span>
                      : <span className="text-slate-200">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    {day.ot_minutes > 0
                      ? <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            day.status === "P"
                              ? "text-indigo-700 bg-indigo-50 border-indigo-100"
                              : "text-amber-700 bg-amber-50 border-amber-100"
                          }`}
                          title={day.status === "P" ? "Weekday OT" : "Week-off OT"}
                        >
                          <Ico d={P.lightning} className="w-2.5 h-2.5" />
                          {formatOT(day.ot_minutes)}
                          {day.status !== "P" && <span className="opacity-60">(WO)</span>}
                        </span>
                      : <span className="text-slate-200">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    <DeductionCell day={day} empId={emp.employee_id} cycleStart={cycleStart} canEdit={canEdit} onRefresh={onRefresh} />
                  </td>
                  <td className="px-3 py-2.5 max-w-[180px]">
                    {day.deduction_reasons.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {day.deduction_reasons.map((r, i) => (
                          <span key={i} className="inline-block bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-medium">
                            {DED_TYPE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee Card — with 4-tier color left border
// ─────────────────────────────────────────────────────────────────────────────
function EmployeeCard({ emp, cycleStart, canEdit, onRefresh, isOpen, onToggle }) {
  const open = isOpen;

  const scheduledDays = emp.total_present + emp.total_absent + emp.total_leave;
  const pct    = scheduledDays > 0 ? Math.round((emp.total_present / scheduledDays) * 100) : 0;
  const ac     = attColor(pct);
  const hasOT  = emp.total_ot_hours > 0;
  const hasLOP = emp.total_deduction_days > 0;
  const hasOverride = emp.days.some(d => d.has_manual_override);
  const lateCount   = useMemo(() => emp.days.filter(d => d.late_by_minutes > 0).length,  [emp.days]);
  const earlyCount  = useMemo(() => emp.days.filter(d => d.early_by_minutes > 0).length, [emp.days]);

  const metrics = [
    { label:"Present",  value:emp.total_present,  c:"text-emerald-700", bg:"bg-emerald-50 border-emerald-100" },
    { label:"Absent",   value:emp.total_absent,   c:"text-red-600",     bg:"bg-red-50 border-red-100"         },
    { label:"Leave",    value:emp.total_leave,    c:"text-violet-700",  bg:"bg-violet-50 border-violet-100"   },
    { label:"Week Off", value:emp.total_wo,       c:"text-slate-500",   bg:"bg-slate-50 border-slate-200"     },
    { label:"Holiday",  value:emp.total_holidays, c:"text-blue-700",    bg:"bg-blue-50 border-blue-100"       },
    ...(lateCount  > 0 ? [{ label:"Late",     value:lateCount,  c:"text-orange-600", bg:"bg-orange-50 border-orange-100" }] : []),
    ...(earlyCount > 0 ? [{ label:"Early",    value:earlyCount, c:"text-amber-600",  bg:"bg-amber-50 border-amber-100"   }] : []),
    ...(hasOT  ? [{ label:"OT Hrs",  value:`${emp.total_ot_hours.toFixed(1)}h`,        c:"text-indigo-700",  bg:"bg-indigo-50 border-indigo-100"   }] : []),
    ...(hasLOP ? [{ label:"LOP",     value:`${emp.total_deduction_days.toFixed(2)}d`,   c:"text-red-600",     bg:"bg-red-50 border-red-100"         }] : []),
  ];

  return (
    <div
      className={`bg-white rounded-xl border-l-4 ${ac.left} border border-slate-200 overflow-hidden transition-all duration-200 ${
        open ? "shadow-md border-slate-300" : "hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => onToggle(emp.employee_id)}
        aria-expanded={open}
        aria-controls={`emp-detail-${emp.employee_id}`}
        className="w-full text-left px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm ${nameColorClass(emp.employee_name)}`}>
            {nameInitials(emp.employee_name)}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-800 leading-tight">{emp.employee_name}</h3>
              {emp.employee_code && (
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md font-semibold tracking-wide">
                  #{emp.employee_code}
                </span>
              )}
              {/* Status chips — only notable ones */}
              {hasLOP && (
                <span title={`LOP: ${emp.total_deduction_days.toFixed(2)} days deducted`}
                  className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"
                >
                  LOP {emp.total_deduction_days.toFixed(2)}d
                </span>
              )}
              {hasOT && (
                <span title={`Overtime: ${emp.total_ot_hours.toFixed(1)} hours`}
                  className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full"
                >
                  OT {emp.total_ot_hours.toFixed(1)}h
                </span>
              )}
              {hasOverride && (
                <span title="Has manual override(s) applied"
                  className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full"
                >
                  Override
                </span>
              )}
            </div>
            {emp.shift_info && (
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <Ico d={P.clock} className="w-3 h-3 text-slate-300" />
                {emp.shift_info}
              </p>
            )}
            {/* Attendance progress bar — 4-tier colored */}
            <div className="flex items-center gap-2.5 mt-2.5">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Attendance ${pct}%`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${ac.bar}`}
                  style={{ width:`${pct}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${ac.text}`}>{pct}%</span>
            </div>
          </div>

          {/* Circular ring + chevron */}
          <div className="flex items-center gap-3 shrink-0 ml-1">
            <AttRing pct={pct} size={46} />
            <div className={`text-slate-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
              <Ico d={P.chevD} className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Metric chips — indented to align with name */}
        <div className="flex flex-wrap gap-1.5 mt-3 ml-[60px]">
          {metrics.map(m => (
            <div key={m.label} className={`flex flex-col items-center justify-center border rounded-lg px-2.5 py-1.5 ${m.bg}`}>
              <p className={`text-[13px] font-bold leading-none tabular-nums ${m.c}`}>{m.value}</p>
              <p className="text-[9px] text-slate-400 mt-1 font-semibold uppercase tracking-wide leading-none">{m.label}</p>
            </div>
          ))}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div id={`emp-detail-${emp.employee_id}`}>
          <ExpandedDetail emp={emp} cycleStart={cycleStart} canEdit={canEdit} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_SIZES = [25, 50, 100, 250];
function Pagination({ page, pageCount, total, pageSize, onPage, onPageSize, filteredCount }) {
  function pageNums() {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    if (page <= 4)             return [1,2,3,4,5,"…",pageCount];
    if (page >= pageCount - 3) return [1,"…",pageCount-4,pageCount-3,pageCount-2,pageCount-1,pageCount];
    return [1,"…",page-1,page,page+1,"…",pageCount];
  }
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <p className="text-xs text-slate-500">
        Showing <strong className="text-slate-700">{Math.min((page-1)*pageSize+1, filteredCount)}–{Math.min(page*pageSize, filteredCount)}</strong> of <strong className="text-slate-700">{filteredCount}</strong>
        {filteredCount < total && <span className="text-slate-300 ml-1">(filtered from {total})</span>}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400" htmlFor="pg-size">Per page</label>
          <select id="pg-size" value={pageSize} onChange={e => { onPageSize(Number(e.target.value)); onPage(1); }}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button onClick={() => onPage(page-1)} disabled={page === 1} aria-label="Previous page"
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          {pageNums().map((n, i) =>
            n === "…"
              ? <span key={`e${i}`} className="w-7 text-center text-xs text-slate-300">…</span>
              : <button key={n} onClick={() => onPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                    n === page ? "bg-indigo-600 text-white shadow-sm" : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >{n}</button>
          )}
          <button onClick={() => onPage(page+1)} disabled={page === pageCount} aria-label="Next page"
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </nav>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const inputCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white";

export default function LOPReportPage() {
  const { user } = useAuth();
  const isSuperAdmin   = user?.roles?.includes("SUPER_ADMIN");
  const hasAdminModule = (user?.modules ?? []).includes("admin");
  const canEdit = isSuperAdmin || hasAdminModule;

  // ── Core state — UNCHANGED ───────────────────────────────────────────────
  const [cycleStart,   setCycleStart]   = useState(currentCycleStart());
  const [report,       setReport]       = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [calculating,  setCalculating]  = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [error,        setError]        = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [search,           setSearch]           = useState("");
  const [statusFilter,     setStatusFilter]     = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [successMsg,       setSuccessMsg]        = useState("");
  const [page,             setPage]             = useState(1);
  const [pageSize,         setPageSize]         = useState(25);
  const [openIds,          setOpenIds]          = useState(new Set());

  function toggleEmployee(id) {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const cycleEnd = useMemo(() => {
    const d = new Date(cycleStart);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-20`;
  }, [cycleStart]);

  // ── Business logic — UNCHANGED ───────────────────────────────────────────
  async function handleLoad() {
    setLoading(true); setError("");
    try {
      const data = await getAttendanceReport(cycleStart);
      setReport(data);
      setPage(1);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report");
    } finally { setLoading(false); }
  }
  async function handleCalculate() {
    setCalculating(true); setError("");
    try {
      await calculateLOP(cycleStart);
      await handleLoad();
      setSuccessMsg("LOP recalculated successfully.");
    } catch (err) {
      setError(err.response?.data?.detail || "Calculation failed");
    } finally { setCalculating(false); }
  }
  async function executeDelete() {
    setDeleteDialogOpen(false);
    setDeleting(true); setError("");
    try {
      const res = await deleteCycleAttendance(cycleStart);
      setReport(null);
      setSuccessMsg(`Deleted: ${res.attendance_records_deleted} records & ${res.deductions_deleted} deductions.`);
    } catch (err) {
      setError(err.response?.data?.detail || "Delete failed");
    } finally { setDeleting(false); }
  }

  // ── Aggregates ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!report) return null;
    const emps     = report.employees;
    const totalOT  = emps.reduce((s, e) => s + (e.total_ot_hours   || 0), 0);
    const totalLOP = emps.reduce((s, e) => s + (e.total_deduction_days || 0), 0);
    const totP     = emps.reduce((s, e) => s + (e.total_present    || 0), 0);
    const totA     = emps.reduce((s, e) => s + (e.total_absent     || 0), 0);
    const totL     = emps.reduce((s, e) => s + (e.total_leave      || 0), 0);
    const sched    = totP + totA + totL;
    const avgAtt   = sched > 0 ? Math.round((totP / sched) * 100) : 0;
    const overrides = emps.filter(e => e.days.some(d => d.has_manual_override)).length;
    const acAvg     = attColor(avgAtt);
    return { totalEmp:emps.length, totalOT, totalLOP, totalPresent:totP, avgAtt, overrides, acAvg };
  }, [report]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filteredEmps = useMemo(() => {
    if (!report) return [];
    let list = report.employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.employee_name.toLowerCase().includes(q) ||
        (e.employee_code ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter === "has_ot")       list = list.filter(e => e.total_ot_hours > 0);
    if (statusFilter === "has_lop")      list = list.filter(e => e.total_deduction_days > 0);
    if (statusFilter === "has_override") list = list.filter(e => e.days.some(d => d.has_manual_override));
    return list;
  }, [report, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredEmps.length / pageSize));
  const pagedEmps = filteredEmps.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const isBusy = loading || calculating || deleting;

  // Quick filter config
  const quickFilters = report ? [
    { value:"",             label:"All",            count: report.employees.length },
    { value:"has_lop",      label:"Has LOP",        count: report.employees.filter(e => e.total_deduction_days > 0).length },
    { value:"has_ot",       label:"Has OT",         count: report.employees.filter(e => e.total_ot_hours > 0).length },
    { value:"has_override", label:"Overridden",     count: report.employees.filter(e => e.days.some(d => d.has_manual_override)).length },
  ] : [];

  return (
    <div className="space-y-4">
      <DeleteDialog open={deleteDialogOpen} cycleStart={cycleStart} cycleEnd={cycleEnd}
        onConfirm={executeDelete} onCancel={() => setDeleteDialogOpen(false)} deleting={deleting}
      />
      <SuccessToast msg={successMsg} onClose={() => setSuccessMsg("")} />

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Attendance &amp; LOP Report</h1>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
            Cycle 21st → 20th · OT and LOP deductions
            {report && (
              <span className="font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium text-[11px]">
                {report.cycle_start} → {report.cycle_end}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Sticky action bar ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 pt-1 pb-2.5" style={{ background:"rgb(248 250 252 / 0.96)", backdropFilter:"blur(10px)" }}>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Cycle picker */}
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="cycle-start" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Cycle</label>
              <input id="cycle-start" type="date" value={cycleStart} onChange={e => setCycleStart(e.target.value)}
                className={inputCls + " py-1.5 text-[13px] w-40"}
                aria-label="Cycle start date"
              />
            </div>

            <div className="w-px h-6 bg-slate-100 hidden sm:block" />

            {/* View Report — primary */}
            <button onClick={handleLoad} disabled={isBusy}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-busy={loading}
            >
              {loading
                ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Loading…</>
                : <><Ico d={P.report} className="w-3.5 h-3.5" />View Report</>
              }
            </button>

            {/* Recalculate — secondary */}
            {canEdit && (
              <button onClick={handleCalculate} disabled={isBusy}
                className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-busy={calculating}
              >
                {calculating
                  ? <><span className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-700 rounded-full animate-spin" />Calculating…</>
                  : <><Ico d={P.refresh} className="w-3.5 h-3.5" />Recalculate LOP</>
                }
              </button>
            )}

            {/* Delete — danger */}
            {canEdit && (
              <button onClick={() => setDeleteDialogOpen(true)} disabled={isBusy}
                className="inline-flex items-center gap-1.5 border border-red-100 bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 text-sm font-semibold px-4 py-2 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <Ico d={P.trash} className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete Cycle</span>
              </button>
            )}

            {/* Calculating inline status */}
            {calculating && (
              <span className="flex items-center gap-1.5 text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg ml-auto">
                <span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                Recalculating attendance &amp; LOP…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <Ico d={P.warn} className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Something went wrong</p>
            <p className="text-xs text-red-500 mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError("")} aria-label="Dismiss error" className="text-red-300 hover:text-red-500 transition-colors shrink-0">
            <Ico d={P.xsm} className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── KPI grid ────────────────────────────────────────────────────────── */}
      {loading && !report && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({length:6}).map((_,i) => <SkeletonKpi key={i} />)}
        </div>
      )}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={P.users}     label="Employees"        value={kpis.totalEmp}                         color="text-indigo-700"  iconBg="bg-indigo-50"  iconColor="text-indigo-500" />
          <KpiCard icon={P.check}     label="Present Records"  value={kpis.totalPresent}                     color="text-emerald-700" iconBg="bg-emerald-50" iconColor="text-emerald-500" />
          <KpiCard icon={P.lightning} label="Total OT"         value={`${kpis.totalOT.toFixed(1)}h`}        color="text-indigo-600"  iconBg="bg-indigo-50"  iconColor="text-indigo-400" />
          <KpiCard icon={P.minus}     label="Total LOP"        value={`${kpis.totalLOP.toFixed(2)}d`}       color="text-red-700"     iconBg="bg-red-50"     iconColor="text-red-400"    alert={kpis.totalLOP > 0} />
          <KpiCard icon={P.percent}   label="Avg Attendance"   value={`${kpis.avgAtt}%`}                    color={kpis.acAvg.text}  iconBg="bg-slate-50"   iconColor="text-slate-400"
            sub={kpis.avgAtt >= 90 ? "Excellent" : kpis.avgAtt >= 75 ? "Satisfactory" : kpis.avgAtt >= 60 ? "Needs attention" : "Critical"}
          />
          <KpiCard icon={P.override}  label="Manual Overrides" value={kpis.overrides}                       color="text-violet-700"  iconBg="bg-violet-50"  iconColor="text-violet-400" alert={kpis.overrides > 0} />
        </div>
      )}

      {/* ── Report body ─────────────────────────────────────────────────────── */}
      {report && (
        <div className="space-y-3">
          {/* Search + filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Ico d={P.search} className="w-3.5 h-3.5 text-slate-300" />
                </div>
                <input type="search" placeholder="Name or code…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={inputCls + " pl-9 w-48 py-1.5 text-[13px]"}
                  aria-label="Search employees by name or code"
                />
              </div>

              <div className="w-px h-5 bg-slate-100 hidden sm:block" />

              {/* Quick filter pills */}
              <div role="group" aria-label="Filter employees" className="flex items-center gap-1.5 flex-wrap">
                {quickFilters.map(f => (
                  <button key={f.value} onClick={() => setStatusFilter(f.value)}
                    aria-pressed={statusFilter === f.value}
                    className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      statusFilter === f.value
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50/40"
                    }`}
                  >
                    {f.label}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                      statusFilter === f.value ? "bg-white/25 text-white" : "bg-slate-100 text-slate-400"
                    }`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              {(search || statusFilter) && (
                <button onClick={() => { setSearch(""); setStatusFilter(""); }}
                  aria-label="Clear all filters"
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors font-medium ml-0.5"
                >
                  <Ico d={P.xsm} className="w-3.5 h-3.5" /> Clear
                </button>
              )}

              <div className="ml-auto text-[11px] text-slate-400 font-medium">
                {filteredEmps.length} of {report.employees.length} employees
              </div>
            </div>
          </div>

          {/* Empty states */}
          {report.employees.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Ico d={P.report} className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mb-1">No attendance data for this cycle</p>
              <p className="text-xs text-slate-400">Import attendance data or select a different payroll cycle.</p>
            </div>
          ) : filteredEmps.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                <Ico d={P.search} className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500 mb-0.5">No employees match your filters</p>
              <p className="text-xs text-slate-400 mb-4">Try adjusting your search or clearing the active filter.</p>
              <button onClick={() => { setSearch(""); setStatusFilter(""); }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all"
              >
                Clear filters
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-2.5">
              {Array.from({length:5}).map((_,i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {pagedEmps.map(emp => (
                  <EmployeeCard key={emp.employee_id} emp={emp} cycleStart={cycleStart} canEdit={canEdit} onRefresh={handleLoad}
                    isOpen={openIds.has(emp.employee_id)} onToggle={toggleEmployee} />
                ))}
              </div>

              {pageCount > 1 && (
                <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5">
                  <Pagination page={page} pageCount={pageCount} total={report.employees.length}
                    pageSize={pageSize} filteredCount={filteredEmps.length} onPage={setPage} onPageSize={setPageSize}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Initial state — no report loaded */}
      {!report && !loading && !error && (
        <div className="bg-white rounded-xl border border-slate-200 py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5">
            <Ico d={P.report} className="w-8 h-8 text-indigo-300" />
          </div>
          <h3 className="text-base font-bold text-slate-700 mb-1">Select a payroll cycle</h3>
          <p className="text-sm text-slate-400 mb-7 max-w-xs mx-auto">Choose a cycle start date above and click <strong className="text-slate-600">View Report</strong> to load attendance data.</p>
          <button onClick={handleLoad}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Ico d={P.report} className="w-4 h-4" /> View Report
          </button>
        </div>
      )}
    </div>
  );
}
