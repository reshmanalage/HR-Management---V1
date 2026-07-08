import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deactivateEmployee, getEmployee, addSalaryRevision, deleteSalaryRevision } from "../../services/employeeService";

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCTC(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function yos(doj) {
  if (!doj) return null;
  const d = new Date(doj);
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  if (months < 1) return "< 1m";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  return m === 0 ? `${y}y` : `${y}y ${m}m`;
}

function initials(emp) {
  return `${(emp.first_name?.[0] ?? "").toUpperCase()}${(emp.last_name?.[0] ?? "").toUpperCase()}`;
}

const PALETTE = [
  "bg-indigo-500","bg-violet-500","bg-pink-500","bg-rose-500","bg-teal-500",
  "bg-cyan-500","bg-sky-500","bg-emerald-500","bg-amber-500","bg-orange-500",
];
function avatarColor(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff;
  return PALETTE[h % PALETTE.length];
}

function completionItems(emp) {
  const s = emp.statutory;
  return [
    { key: "photo",        label: "Profile Photo",   done: !!emp.photo_url },
    { key: "dob",          label: "Date of Birth",   done: !!emp.date_of_birth },
    { key: "gender",       label: "Gender",          done: !!emp.gender },
    { key: "blood",        label: "Blood Group",     done: !!emp.blood_group },
    { key: "mobile",       label: "Mobile Number",   done: !!emp.mobile_number },
    { key: "email",        label: "Email Address",   done: !!(emp.personal_email || emp.company_email) },
    { key: "address",      label: "Address",         done: (emp.addresses?.length ?? 0) > 0 },
    { key: "designation",  label: "Designation",     done: !!emp.designation },
    { key: "department",   label: "Department",      done: !!emp.department },
    { key: "bank",         label: "Bank Account",    done: (emp.bank_accounts?.length ?? 0) > 0 },
    { key: "docs",         label: "Documents",       done: (emp.documents?.length ?? 0) > 0 },
    { key: "pan",          label: "PAN Number",      done: !!s?.pan_number },
    { key: "aadhaar",      label: "Aadhaar Number",  done: !!s?.aadhaar_number },
    { key: "uan",          label: "UAN / PF",        done: !!s?.uan_number },
  ];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  active:        { label: "Active",        bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", accent: "from-emerald-500" },
  probation:     { label: "Probation",     bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400",   accent: "from-amber-400"   },
  notice_period: { label: "Notice Period", bg: "bg-orange-100",  text: "text-orange-700",  dot: "bg-orange-400",  accent: "from-orange-400"  },
  inactive:      { label: "Inactive",      bg: "bg-slate-100",   text: "text-slate-500",   dot: "bg-slate-400",   accent: "from-slate-400"   },
  terminated:    { label: "Terminated",    bg: "bg-red-100",     text: "text-red-600",     dot: "bg-red-500",     accent: "from-red-500"     },
};

const EMP_TYPE_LABELS = {
  permanent: "Permanent", probation: "Probation", contract: "Contract",
  intern: "Intern", part_time: "Part-Time", consultant: "Consultant",
};

// ─── Icons ─────────────────────────────────────────────────────────────────────

const P = {
  user:      "M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z",
  pencil:    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  building:  "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z",
  briefcase: "M20 7h-4V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-8-2h4v2h-4V5zM4 9h16v2H4V9zm0 11V13h6v2h4v-2h6v7H4z",
  calendar:  "M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z",
  phone:     "M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
  mail:      "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  pin:       "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
  clock:     "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
  shield:    "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z",
  card:      "M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  document:  "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  checkFill: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  xFill:     "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z",
  download:  "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  print:     "M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z",
  warn:      "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  users:     "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  id:        "M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zM8 9c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 8H4v-1c0-1.33 2.67-2 4-2s4 .67 4 2v1zm8-5h-6v-2h6v2zm0-4h-6V6h6v2z",
  dots:      "M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  ctc:       "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  chevD:     "M7 10l5 5 5-5z",
  x:         "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  key:       "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
};

function Ico({ d, size = 18, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

// ─── Shared components ─────────────────────────────────────────────────────────

function StatusBadge({ status, variant = "light" }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.inactive;
  if (variant === "dark") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-white/15 text-white border border-white/20">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function InfoRow({ label, value, mono = false, span2 = false }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5 leading-none">{label}</dt>
      <dd className={`text-sm text-slate-800 font-medium leading-snug ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function InfoCard({ title, icon, editHref, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Ico d={icon} size={14} className="text-indigo-500" />
          </span>
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">{title}</h3>
        </div>
        {editHref && (
          <Link
            to={editHref}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <Ico d={P.pencil} size={12} /> Edit
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Profile Completion ────────────────────────────────────────────────────────

function ProfileCompletion({ emp }) {
  const items = completionItems(emp);
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  const missing = items.filter(i => !i.done);
  const C = 2 * Math.PI * 28;
  const strokeColor = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#f1f5f9" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="28" fill="none"
              stroke={strokeColor} strokeWidth="6"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct / 100)}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-slate-800">{pct}%</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-700">{pct}% Complete</p>
          <p className="text-xs text-slate-400 mt-0.5">{done} of {items.length} fields filled</p>
          {missing.length > 0 && (
            <p className="text-xs text-amber-500 font-medium mt-1">{missing.length} items pending</p>
          )}
        </div>
      </div>
      {missing.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Missing</p>
          <div className="grid grid-cols-2 gap-1">
            {missing.map(item => (
              <div key={item.key} className="flex items-center gap-1.5 text-xs text-slate-500">
                <Ico d={P.warn} size={11} className="text-amber-400 flex-shrink-0" />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity Timeline ─────────────────────────────────────────────────────────

function ActivityTimeline({ emp }) {
  const events = [];

  if (emp.date_of_joining) {
    events.push({
      date: emp.date_of_joining,
      title: "Joined Company",
      desc: [emp.designation?.title, emp.department?.name].filter(Boolean).join(" · ") || "Employment commenced",
      icon: P.briefcase, iconBg: "bg-emerald-50", iconColor: "text-emerald-500",
    });
  }
  if (emp.confirmation_date && emp.confirmation_date !== emp.date_of_joining) {
    events.push({
      date: emp.confirmation_date,
      title: "Confirmed",
      desc: "Probation period completed — moved to permanent employment",
      icon: P.checkFill, iconBg: "bg-indigo-50", iconColor: "text-indigo-500",
    });
  }
  if ((emp.bank_accounts?.length ?? 0) > 0) {
    events.push({
      date: null, title: "Bank Account Linked",
      desc: `${emp.bank_accounts[0].bank_name}${emp.bank_accounts[0].is_verified ? " — Verified" : " — Pending verification"}`,
      icon: P.card, iconBg: "bg-violet-50", iconColor: "text-violet-500",
    });
  }
  if ((emp.documents?.length ?? 0) > 0) {
    events.push({
      date: null, title: `${emp.documents.length} Document${emp.documents.length > 1 ? "s" : ""} Uploaded`,
      desc: emp.documents.slice(0, 3).map(d => d.document_label || d.document_type).join(", "),
      icon: P.document, iconBg: "bg-blue-50", iconColor: "text-blue-500",
    });
  }
  if (emp.statutory?.pan_number || emp.statutory?.uan_number) {
    events.push({
      date: null, title: "Statutory Details Added",
      desc: [emp.statutory.pan_number && "PAN", emp.statutory.uan_number && "UAN"].filter(Boolean).join(", ") + " recorded",
      icon: P.shield, iconBg: "bg-teal-50", iconColor: "text-teal-500",
    });
  }

  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });

  if (events.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-4">No activity recorded.</p>;
  }

  return (
    <div>
      {events.map((ev, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${ev.iconBg} ${ev.iconColor}`}>
              <Ico d={ev.icon} size={14} />
            </div>
            {i < events.length - 1 && <div className="w-px flex-1 bg-slate-100 my-1 min-h-[12px]" />}
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-700">{ev.title}</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{ev.desc}</p>
            {ev.date && <p className="text-[10px] text-slate-300 mt-1 font-medium">{fmt(ev.date)}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skel({ className }) {
  return <div className={`bg-slate-200 animate-pulse rounded-lg ${className}`} />;
}

function ProfileSkeleton() {
  return (
    <div className="max-w-6xl space-y-5">
      <div className="bg-gradient-to-r from-slate-200 to-slate-300 animate-pulse rounded-2xl h-44" />
      <div className="grid grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
            <Skel className="w-8 h-8 rounded-lg" />
            <Skel className="w-14 h-5" />
            <Skel className="w-full h-3" />
          </div>
        ))}
      </div>
      <div className="flex gap-5">
        <div className="w-64 shrink-0 space-y-2">
          <Skel className="h-96" />
        </div>
        <div className="flex-1 space-y-4">
          <Skel className="h-10" />
          <Skel className="h-56" />
          <Skel className="h-40" />
        </div>
      </div>
    </div>
  );
}

// ─── Deactivate Dialog ─────────────────────────────────────────────────────────

function DeactivateDialog({ open, emp, onConfirm, onCancel }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const fullName = `${emp.first_name} ${emp.last_name}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="deact-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Ico d={P.warn} size={20} className="text-red-500" />
          </div>
          <div>
            <h2 id="deact-title" className="text-base font-bold text-slate-800">Deactivate Employee</h2>
            <p className="text-xs text-slate-400">This action will revoke system access.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          You are about to deactivate <strong className="text-slate-800">{fullName}</strong>{" "}
          <span className="font-mono text-xs text-slate-400">({emp.employee_code})</span>. They will be marked as inactive and lose system access.
        </p>
        <p className="text-xs text-slate-500 mb-2">
          Type <strong className="font-mono">DEACTIVATE</strong> to confirm:
        </p>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && input === "DEACTIVATE") onConfirm(); }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 mb-4"
          placeholder="DEACTIVATE"
          autoComplete="off"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={input !== "DEACTIVATE"}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Profile Hero ──────────────────────────────────────────────────────────────

function ProfileHero({ emp, onDeactivate, moreRef, onMoreClick }) {
  const sc = STATUS_CFG[emp.employee_status] ?? STATUS_CFG.inactive;
  const ini = initials(emp);
  const ac = avatarColor(`${emp.first_name}${emp.last_name}`);
  const service = yos(emp.date_of_joining);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 rounded-2xl overflow-hidden mb-5">
      <div className="h-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400" />
      <div className="px-7 py-6 flex items-start gap-6">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {emp.photo_url ? (
            <img
              src={emp.photo_url}
              alt={`${emp.first_name} ${emp.last_name}`}
              className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white/20"
              onError={e => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className={`w-20 h-20 rounded-2xl ${ac} flex items-center justify-center ring-4 ring-white/20 text-white text-2xl font-bold select-none`}>
              {ini}
            </div>
          )}
          <span
            className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${sc.dot}`}
            title={sc.label}
          />
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
                  {emp.display_name || `${emp.first_name} ${emp.last_name}`}
                </h1>
                <StatusBadge status={emp.employee_status} variant="dark" />
              </div>
              <p className="text-indigo-300/80 text-xs mt-1 font-mono tracking-wider">{emp.employee_code}</p>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {emp.designation?.title && (
                  <span className="text-slate-200 text-sm font-semibold">{emp.designation.title}</span>
                )}
                {emp.designation?.title && emp.department?.name && (
                  <span className="text-slate-600 text-sm">·</span>
                )}
                {emp.department?.name && (
                  <span className="text-slate-300 text-sm">{emp.department.name}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
                {emp.branch && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Ico d={P.pin} size={12} className="text-slate-500" />{emp.branch}
                  </span>
                )}
                {emp.employment_type && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Ico d={P.briefcase} size={12} className="text-slate-500" />
                    {EMP_TYPE_LABELS[emp.employment_type] ?? emp.employment_type}
                  </span>
                )}
                {emp.date_of_joining && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Ico d={P.calendar} size={12} className="text-slate-500" />
                    Joined {fmt(emp.date_of_joining)}
                    {service && <span className="text-slate-600 ml-1">· {service}</span>}
                  </span>
                )}
                {emp.reporting_manager && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Ico d={P.users} size={12} className="text-slate-500" />
                    Reports to {emp.reporting_manager.first_name} {emp.reporting_manager.last_name}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                to={`/employees/${emp.id}/edit`}
                className="flex items-center gap-1.5 px-4 py-2 bg-white text-slate-800 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Ico d={P.pencil} size={14} /> Edit
              </Link>
              <div ref={moreRef} className="relative">
                <button
                  onClick={onMoreClick}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors border border-white/15"
                  aria-haspopup="menu"
                >
                  More <Ico d={P.chevD} size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Strip ─────────────────────────────────────────────────────────────────

function KpiStrip({ emp }) {
  const items = completionItems(emp);
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  const docCount = emp.documents?.length ?? 0;
  const verifiedDocs = emp.documents?.filter(d => d.is_verified).length ?? 0;
  const bankAdded = (emp.bank_accounts?.length ?? 0) > 0;
  const bankPrimary = emp.bank_accounts?.find(a => a.is_primary);
  const bankVerified = bankPrimary?.is_verified ?? emp.bank_accounts?.[0]?.is_verified;
  const s = emp.statutory;
  const kycDone = [s?.aadhaar_linked, s?.pan_linked, s?.bank_verified, s?.uan_activated, s?.kyc_verified].filter(Boolean).length;
  const service = yos(emp.date_of_joining);

  const kpis = [
    {
      icon: P.user, label: "Profile",
      value: `${pct}%`, sub: `${done}/${items.length} fields`,
      valueColor: pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-500" : "text-red-500",
      iconBg: "bg-indigo-50", iconColor: "text-indigo-500",
    },
    {
      icon: P.document, label: "Documents",
      value: docCount === 0 ? "—" : String(docCount),
      sub: docCount > 0 ? `${verifiedDocs} verified` : "None uploaded",
      valueColor: docCount > 0 ? "text-blue-600" : "text-slate-400",
      iconBg: "bg-blue-50", iconColor: "text-blue-500",
    },
    {
      icon: P.card, label: "Bank Account",
      value: bankAdded ? (bankVerified ? "✓" : "Added") : "—",
      sub: bankAdded ? (bankVerified ? "Verified" : "Pending verification") : "Not added",
      valueColor: bankVerified ? "text-emerald-600" : bankAdded ? "text-amber-500" : "text-slate-400",
      iconBg: "bg-violet-50", iconColor: "text-violet-500",
    },
    {
      icon: P.shield, label: "KYC Status",
      value: s ? `${kycDone}/5` : "—",
      sub: s ? (kycDone === 5 ? "All verified" : `${5 - kycDone} pending`) : "No data",
      valueColor: kycDone === 5 ? "text-emerald-600" : kycDone >= 3 ? "text-amber-500" : "text-red-500",
      iconBg: "bg-emerald-50", iconColor: "text-emerald-500",
    },
    {
      icon: P.calendar, label: "Service",
      value: service ?? "—",
      sub: emp.date_of_joining ? `Since ${fmt(emp.date_of_joining)}` : "—",
      valueColor: "text-slate-800",
      iconBg: "bg-amber-50", iconColor: "text-amber-500",
    },
    {
      icon: P.clock, label: "Shift",
      value: emp.shift_obj?.name ?? emp.shift ?? "—",
      sub: emp.shift_obj?.start_time ? `${emp.shift_obj.start_time}–${emp.shift_obj.end_time}` : "No shift assigned",
      valueColor: "text-slate-800",
      iconBg: "bg-teal-50", iconColor: "text-teal-500",
    },
    {
      icon: P.ctc, label: "Current CTC",
      value: emp.ctc ? fmtCTC(emp.ctc) : "—",
      sub: emp.ctc ? `₹${Number(emp.ctc).toLocaleString("en-IN")} per annum` : "Not set",
      valueColor: emp.ctc ? "text-indigo-600" : "text-slate-400",
      iconBg: "bg-indigo-50", iconColor: "text-indigo-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
      {kpis.map((k, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-default"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${k.iconBg} ${k.iconColor}`}>
            <Ico d={k.icon} size={15} />
          </div>
          <div className={`text-lg font-extrabold tracking-tight leading-none mb-1 font-variant-numeric: tabular-nums ${k.valueColor}`}>
            {k.value}
          </div>
          <div className="text-xs font-semibold text-slate-600 leading-none mb-0.5">{k.label}</div>
          <div className="text-[10px] text-slate-400 leading-snug">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

function ProfileSidebar({ emp, onDeactivate }) {
  const items = completionItems(emp);
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  const ini = initials(emp);
  const ac = avatarColor(`${emp.first_name}${emp.last_name}`);
  const sc = STATUS_CFG[emp.employee_status] ?? STATUS_CFG.inactive;

  return (
    <aside className="w-64 shrink-0 space-y-3">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Status accent line */}
        <div className={`h-0.5 ${sc.dot}`} />

        {/* Avatar + name */}
        <div className="p-5 text-center">
          {emp.photo_url ? (
            <img
              src={emp.photo_url} alt=""
              className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 ring-2 ring-slate-100"
              onError={e => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className={`w-16 h-16 rounded-2xl ${ac} text-white text-xl font-bold flex items-center justify-center mx-auto mb-3 select-none`}>
              {ini}
            </div>
          )}
          <h2 className="text-sm font-bold text-slate-900 leading-snug">
            {emp.display_name || `${emp.first_name} ${emp.last_name}`}
          </h2>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{emp.employee_code}</p>
          <div className="mt-2 flex justify-center">
            <StatusBadge status={emp.employee_status} />
          </div>
        </div>

        {/* Key details */}
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {[
            { icon: P.briefcase, label: "Designation", val: emp.designation?.title },
            { icon: P.building,  label: "Department",  val: emp.department?.name },
            { icon: P.users,     label: "Reports To",  val: emp.reporting_manager ? `${emp.reporting_manager.first_name} ${emp.reporting_manager.last_name}` : null },
            { icon: P.pin,       label: "Branch",      val: emp.branch },
            { icon: P.clock,     label: "Shift",       val: emp.shift_obj ? `${emp.shift_obj.name}${emp.shift_obj.start_time ? ` (${emp.shift_obj.start_time}–${emp.shift_obj.end_time})` : ""}` : emp.shift },
          ].filter(r => r.val).map(row => (
            <div key={row.label} className="flex items-start gap-2.5">
              <Ico d={row.icon} size={13} className="text-slate-300 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">{row.label}</p>
                <p className="text-xs text-slate-700 font-medium leading-snug">{row.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Profile completion mini */}
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Profile</span>
            <span className={`text-xs font-bold ${pct >= 80 ? "text-emerald-500" : pct >= 60 ? "text-amber-500" : "text-red-500"}`}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{done}/{items.length} fields complete</p>
        </div>

        {/* Quick contact */}
        <div className="border-t border-slate-100 px-4 py-3 space-y-1.5">
          {emp.mobile_number && (
            <a href={`tel:${emp.mobile_number}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600 transition-colors group">
              <Ico d={P.phone} size={12} className="text-slate-300 group-hover:text-indigo-400" />
              {emp.mobile_number}
            </a>
          )}
          {(emp.company_email || emp.personal_email) && (
            <a
              href={`mailto:${emp.company_email || emp.personal_email}`}
              className="flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600 transition-colors group min-w-0"
            >
              <Ico d={P.mail} size={12} className="text-slate-300 group-hover:text-indigo-400 flex-shrink-0" />
              <span className="truncate">{emp.company_email || emp.personal_email}</span>
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-slate-100 p-4 space-y-2">
          <Link
            to={`/employees/${emp.id}/edit`}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Ico d={P.pencil} size={13} /> Edit Profile
          </Link>
          <button
            onClick={onDeactivate}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 border border-red-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-50 transition-colors"
          >
            <Ico d={P.x} size={13} /> Deactivate
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Tab content ───────────────────────────────────────────────────────────────

function OverviewTab({ emp }) {
  const editHref = `/employees/${emp.id}/edit`;
  const fullName = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title="Personal Information" icon={P.user} editHref={editHref}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow label="Full Name" value={fullName} />
            <InfoRow label="Display Name" value={emp.display_name} />
            <InfoRow label="Gender" value={emp.gender ? emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1) : null} />
            <InfoRow label="Date of Birth" value={fmt(emp.date_of_birth)} />
            <InfoRow label="Blood Group" value={emp.blood_group} />
            <InfoRow label="Marital Status" value={emp.marital_status} />
            <InfoRow label="Nationality" value={emp.nationality} />
            <InfoRow label="Religion" value={emp.religion} />
          </dl>
        </InfoCard>

        <InfoCard title="Contact Information" icon={P.phone} editHref={editHref}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow label="Mobile" value={emp.mobile_number} />
            <InfoRow label="Alternate Mobile" value={emp.alternate_mobile} />
            <InfoRow label="Personal Email" value={emp.personal_email} span2 />
            <InfoRow label="Company Email" value={emp.company_email} span2 />
          </dl>
        </InfoCard>
      </div>

      <InfoCard title="Employment Details" icon={P.briefcase} editHref={editHref}>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <InfoRow label="Employee Code" value={emp.employee_code} mono />
          <InfoRow label="Biometric Code" value={emp.biometric_code} mono />
          <InfoRow label="Employment Type" value={EMP_TYPE_LABELS[emp.employment_type] ?? emp.employment_type} />
          <InfoRow label="Grade" value={emp.grade} />
          <InfoRow label="Date of Joining" value={fmt(emp.date_of_joining)} />
          <InfoRow label="Confirmation Date" value={fmt(emp.confirmation_date)} />
          <InfoRow label="Branch" value={emp.branch} />
          <InfoRow label="Location" value={emp.location} />
          <InfoRow label="Cost Center" value={emp.cost_center} />
          <InfoRow
            label="CTC (Annual)"
            value={emp.ctc ? `${fmtCTC(emp.ctc)} (₹${Number(emp.ctc).toLocaleString("en-IN")} p.a.)` : null}
          />
          <InfoRow
            label="Shift"
            value={emp.shift_obj
              ? `${emp.shift_obj.name}${emp.shift_obj.start_time ? ` (${emp.shift_obj.start_time}–${emp.shift_obj.end_time})` : ""}`
              : emp.shift}
          />
        </dl>
      </InfoCard>

      {(emp.addresses?.length ?? 0) > 0 && (
        <InfoCard title="Addresses" icon={P.pin} editHref={editHref}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {emp.addresses.map((addr, i) => (
              <div key={i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {addr.address_type} Address
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {[addr.address_line_1, addr.address_line_2, addr.landmark, addr.city, addr.district, addr.state, addr.postal_code, addr.country]
                    .filter(Boolean).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </InfoCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title="Profile Completion" icon={P.checkFill}>
          <ProfileCompletion emp={emp} />
        </InfoCard>
        <InfoCard title="Activity Timeline" icon={P.calendar}>
          <ActivityTimeline emp={emp} />
        </InfoCard>
      </div>
    </div>
  );
}

function DocumentsTab({ emp }) {
  const docs = emp.documents ?? [];

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Ico d={P.document} size={24} className="text-slate-300" />
        </div>
        <p className="text-sm font-bold text-slate-500">No Documents Uploaded</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
          Upload PAN, Aadhaar, offer letter, and other employee documents to track compliance.
        </p>
        <Link
          to={`/employees/${emp.id}/edit`}
          className="mt-5 flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Ico d={P.pencil} size={13} /> Add Documents
        </Link>
      </div>
    );
  }

  const verified = docs.filter(d => d.is_verified).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400 font-medium">
          {docs.length} document{docs.length !== 1 ? "s" : ""} ·{" "}
          <span className="text-emerald-600 font-semibold">{verified} verified</span>
          {docs.length - verified > 0 && <span className="text-amber-500"> · {docs.length - verified} pending</span>}
        </p>
        <Link
          to={`/employees/${emp.id}/edit`}
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <Ico d={P.pencil} size={12} /> Manage
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {docs.map(doc => (
          <div
            key={doc.id}
            className="bg-white border border-slate-100 rounded-xl shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <Ico d={P.document} size={17} className="text-blue-400" />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${doc.is_verified ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                {doc.is_verified ? "Verified" : "Pending"}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-800 leading-tight">{doc.document_label || doc.document_type}</p>
            {doc.document_number && (
              <p className="text-[11px] text-slate-400 font-mono mt-1">{doc.document_number}</p>
            )}
            {doc.expiry_date && (
              <p className="text-[11px] text-slate-400 mt-1">Expires {fmt(doc.expiry_date)}</p>
            )}
            {doc.file_url && (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
              >
                <Ico d={P.download} size={12} /> View Document
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BankTab({ emp }) {
  const accounts = emp.bank_accounts ?? [];

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Ico d={P.card} size={24} className="text-slate-300" />
        </div>
        <p className="text-sm font-bold text-slate-500">No Bank Accounts Added</p>
        <p className="text-xs text-slate-400 mt-1">Add bank account details for salary disbursement.</p>
        <Link
          to={`/employees/${emp.id}/edit`}
          className="mt-5 flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Ico d={P.pencil} size={13} /> Add Bank Account
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {accounts.map(acct => (
        <div
          key={acct.id}
          className={`bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${acct.is_primary ? "border-indigo-200" : "border-slate-100"}`}
        >
          {acct.is_primary && <div className="h-0.5 bg-gradient-to-r from-indigo-400 to-violet-400" />}
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Ico d={P.card} size={17} className="text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{acct.bank_name}</p>
                  {acct.is_primary && (
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Primary Account</p>
                  )}
                </div>
              </div>
              {acct.is_verified ? (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  <Ico d={P.checkFill} size={12} /> Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                  <Ico d={P.warn} size={12} /> Unverified
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Account Number" value={acct.account_number} mono />
              <InfoRow label="IFSC Code" value={acct.ifsc_code} mono />
              <InfoRow label="Branch" value={acct.branch_name} />
              <InfoRow label="Account Holder" value={acct.account_holder_name} />
              <InfoRow label="Account Type" value={acct.account_type} />
            </dl>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatutoryTab({ emp }) {
  const s = emp.statutory;
  const editHref = `/employees/${emp.id}/edit`;

  if (!s) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Ico d={P.shield} size={24} className="text-slate-300" />
        </div>
        <p className="text-sm font-bold text-slate-500">No Statutory Information</p>
        <p className="text-xs text-slate-400 mt-1">Add PF, ESIC, PAN, and Aadhaar details for compliance.</p>
        <Link
          to={editHref}
          className="mt-5 flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Ico d={P.pencil} size={13} /> Add Statutory Details
        </Link>
      </div>
    );
  }

  const kycItems = [
    { label: "Aadhaar", done: s.aadhaar_linked },
    { label: "PAN", done: s.pan_linked },
    { label: "Bank", done: s.bank_verified },
    { label: "UAN", done: s.uan_activated },
    { label: "KYC", done: s.kyc_verified },
  ];
  const kycDone = kycItems.filter(k => k.done).length;
  const kycOk = kycDone === 5;
  const kycMid = kycDone >= 3;

  return (
    <div className="space-y-4">
      {/* KYC banner */}
      <div className={`rounded-xl p-4 flex items-center gap-4 flex-wrap ${kycOk ? "bg-emerald-50 border border-emerald-100" : kycMid ? "bg-amber-50 border border-amber-100" : "bg-red-50 border border-red-100"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${kycOk ? "bg-emerald-100 text-emerald-600" : kycMid ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"}`}>
          <Ico d={P.shield} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${kycOk ? "text-emerald-700" : kycMid ? "text-amber-700" : "text-red-700"}`}>
            {kycOk ? "KYC Complete" : `KYC Incomplete — ${kycDone}/5 Verified`}
          </p>
          <p className={`text-xs mt-0.5 ${kycOk ? "text-emerald-600" : kycMid ? "text-amber-600" : "text-red-600"}`}>
            {kycOk ? "All compliance checks are complete." : `${5 - kycDone} verification${5 - kycDone > 1 ? "s" : ""} still pending.`}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {kycItems.map(item => (
            <span
              key={item.label}
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
            >
              <Ico d={item.done ? P.checkFill : P.xFill} size={10} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title="PF / EPF Details" icon={P.shield} editHref={editHref}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow label="UAN Number" value={s.uan_number} mono />
            <InfoRow label="PF Member ID" value={s.pf_member_id} mono />
            <InfoRow label="PF Joining Date" value={fmt(s.pf_joining_date)} />
            <div className="col-span-2 pt-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Eligibility</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "PF", val: s.pf_eligible },
                  { label: "VPF", val: s.vpf_eligible },
                  { label: "EPS", val: s.eps_eligible },
                  { label: "EDLI", val: s.edli_eligible },
                ].map(x => (
                  <div key={x.label} className="flex items-center gap-2">
                    <Ico d={x.val ? P.checkFill : P.xFill} size={13} className={x.val ? "text-emerald-500" : "text-slate-300"} />
                    <span className="text-xs text-slate-600">{x.label} Eligible</span>
                  </div>
                ))}
              </div>
            </div>
          </dl>
        </InfoCard>

        <InfoCard title="ESIC Details" icon={P.id} editHref={editHref}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow label="ESIC IP Number" value={s.esic_ip_number} mono />
            <InfoRow label="Joining Date" value={fmt(s.esic_joining_date)} />
            <InfoRow label="Dispensary" value={s.esic_dispensary} />
            <div>
              <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">ESIC Eligible</dt>
              <dd className="flex items-center gap-1.5">
                <Ico d={s.esic_eligible ? P.checkFill : P.xFill} size={14} className={s.esic_eligible ? "text-emerald-500" : "text-slate-300"} />
                <span className="text-sm text-slate-800 font-medium">{s.esic_eligible ? "Yes" : "No"}</span>
              </dd>
            </div>
          </dl>
        </InfoCard>

        <InfoCard title="Tax & Identity" icon={P.key} editHref={editHref} className="lg:col-span-2">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <InfoRow label="PAN Number" value={s.pan_number} mono />
            <InfoRow label="Aadhaar Number" value={s.aadhaar_number ? `XXXX XXXX ${s.aadhaar_number.slice(-4)}` : null} mono />
            <InfoRow label="PT State" value={s.pt_state} />
          </dl>
        </InfoCard>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

// ─── Salary Tab ───────────────────────────────────────────────────────────────

const REVISION_TYPE_CFG = {
  joining:    { label: "Joining CTC",  bg: "bg-indigo-100",  text: "text-indigo-700"  },
  appraisal:  { label: "Appraisal",    bg: "bg-emerald-100", text: "text-emerald-700" },
  promotion:  { label: "Promotion",    bg: "bg-violet-100",  text: "text-violet-700"  },
  correction: { label: "Correction",   bg: "bg-amber-100",   text: "text-amber-700"   },
};

function AddRevisionForm({ employeeId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    effective_date: "",
    ctc: "",
    basic: "",
    hra: "",
    allowances: "",
    revision_type: "appraisal",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.effective_date || !form.ctc) { setErr("Effective date and CTC are required."); return; }
    setSaving(true); setErr("");
    try {
      const payload = {
        effective_date: form.effective_date,
        ctc: Number(form.ctc),
        basic:      form.basic      ? Number(form.basic)      : null,
        hra:        form.hra        ? Number(form.hra)        : null,
        allowances: form.allowances ? Number(form.allowances) : null,
        revision_type: form.revision_type,
        remarks: form.remarks || null,
      };
      const revision = await addSalaryRevision(employeeId, payload);
      onSaved(revision);
    } catch (ex) {
      setErr(ex.response?.data?.detail || ex.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Add Salary Revision</h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Effective Date *</label>
          <input type="date" className={inputCls} value={form.effective_date} onChange={set("effective_date")} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Revision Type</label>
          <select className={inputCls} value={form.revision_type} onChange={set("revision_type")}>
            <option value="joining">Joining CTC</option>
            <option value="appraisal">Appraisal</option>
            <option value="promotion">Promotion</option>
            <option value="correction">Correction</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Annual CTC (₹) *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium select-none">₹</span>
            <input type="number" min="0" step="1000" className={`${inputCls} pl-6`} value={form.ctc} onChange={set("ctc")} placeholder="e.g. 600000" required />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Basic (₹)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium select-none">₹</span>
            <input type="number" min="0" step="100" className={`${inputCls} pl-6`} value={form.basic} onChange={set("basic")} placeholder="Optional" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">HRA (₹)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium select-none">₹</span>
            <input type="number" min="0" step="100" className={`${inputCls} pl-6`} value={form.hra} onChange={set("hra")} placeholder="Optional" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Other Allowances (₹)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium select-none">₹</span>
            <input type="number" min="0" step="100" className={`${inputCls} pl-6`} value={form.allowances} onChange={set("allowances")} placeholder="Optional" />
          </div>
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
        <input type="text" className={inputCls} value={form.remarks} onChange={set("remarks")} placeholder="e.g. Annual appraisal FY 2025-26" />
      </div>
      {err && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mb-3">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? "Saving…" : "Save Revision"}
        </button>
      </div>
    </form>
  );
}

function SalaryTab({ emp, onRevisionChange }) {
  const [revisions, setRevisions] = useState(emp.salary_revisions ?? []);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);

  function handleSaved(revision) {
    const updated = [revision, ...revisions].sort(
      (a, b) => new Date(b.effective_date) - new Date(a.effective_date)
    );
    setRevisions(updated);
    setAdding(false);
    if (onRevisionChange) onRevisionChange(revision.ctc);
  }

  async function handleDelete(revisionId) {
    setDeleting(revisionId);
    try {
      await deleteSalaryRevision(emp.id, revisionId);
      const updated = revisions.filter(r => r.id !== revisionId);
      setRevisions(updated);
      if (onRevisionChange) onRevisionChange(updated[0]?.ctc ?? null);
    } finally {
      setDeleting(null);
    }
  }

  const latest = revisions[0];

  return (
    <div>
      {/* Current CTC banner */}
      {latest ? (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-5 mb-5 text-white flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-75 uppercase tracking-wider mb-1">Current CTC</p>
            <p className="text-3xl font-extrabold tracking-tight">{fmtCTC(latest.ctc)}</p>
            <p className="text-xs opacity-70 mt-1">
              ₹{Number(latest.ctc).toLocaleString("en-IN")} per annum · Effective {fmt(latest.effective_date)}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 text-white`}>
              {REVISION_TYPE_CFG[latest.revision_type]?.label ?? latest.revision_type}
            </span>
            {latest.basic && (
              <div className="mt-3 text-xs opacity-80 space-y-0.5">
                {latest.basic      && <p>Basic: ₹{Number(latest.basic).toLocaleString("en-IN")}</p>}
                {latest.hra        && <p>HRA: ₹{Number(latest.hra).toLocaleString("en-IN")}</p>}
                {latest.allowances && <p>Allowances: ₹{Number(latest.allowances).toLocaleString("en-IN")}</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center mb-5">
          <p className="text-slate-400 text-sm mb-1">No salary records yet</p>
          <p className="text-xs text-slate-400">Add the first CTC entry to start tracking salary history.</p>
        </div>
      )}

      {/* Add revision form */}
      {adding ? (
        <AddRevisionForm employeeId={emp.id} onSaved={handleSaved} onCancel={() => setAdding(false)} />
      ) : (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
          >
            <Ico d={P.pencil} size={13} /> Add Revision
          </button>
        </div>
      )}

      {/* Revision history timeline */}
      {revisions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Salary History</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {revisions.map((r, i) => {
              const cfg = REVISION_TYPE_CFG[r.revision_type] ?? { label: r.revision_type, bg: "bg-slate-100", text: "text-slate-600" };
              const prev = revisions[i + 1];
              const delta = prev ? ((Number(r.ctc) - Number(prev.ctc)) / Number(prev.ctc)) * 100 : null;
              return (
                <div key={r.id} className={`flex items-start gap-4 px-5 py-4 ${i === 0 ? "bg-indigo-50/40" : ""}`}>
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1 shrink-0">
                    <div className={`w-3 h-3 rounded-full border-2 ${i === 0 ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"}`} />
                    {i < revisions.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[24px]" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-slate-800">{fmtCTC(r.ctc)}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                      {delta !== null && (
                        <span className={`text-[10px] font-semibold ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
                        </span>
                      )}
                      {i === 0 && <span className="text-[10px] bg-indigo-600 text-white font-semibold px-2 py-0.5 rounded-full">Current</span>}
                    </div>
                    <p className="text-xs text-slate-500 mb-1">
                      Effective {fmt(r.effective_date)} · ₹{Number(r.ctc).toLocaleString("en-IN")} p.a.
                    </p>
                    {(r.basic || r.hra || r.allowances) && (
                      <p className="text-xs text-slate-400">
                        {[
                          r.basic      && `Basic ₹${Number(r.basic).toLocaleString("en-IN")}`,
                          r.hra        && `HRA ₹${Number(r.hra).toLocaleString("en-IN")}`,
                          r.allowances && `Allowances ₹${Number(r.allowances).toLocaleString("en-IN")}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {r.remarks && <p className="text-xs text-slate-500 italic mt-0.5">"{r.remarks}"</p>}
                  </div>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                    title="Delete revision"
                  >
                    <Ico d={P.x} size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "overview",  label: "Overview",     icon: P.user     },
  { key: "documents", label: "Documents",    icon: P.document },
  { key: "bank",      label: "Bank Details", icon: P.card     },
  { key: "statutory", label: "Statutory",    icon: P.shield   },
  { key: "salary",    label: "Salary",       icon: P.ctc      },
];

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const moreRef = useRef(null);
  const menuPanelRef = useRef(null);

  useEffect(() => {
    getEmployee(Number(id)).then(setEmp).catch(err => {
      setLoadError(err.response?.data?.detail || err.message || "Failed to load employee");
    });
  }, [id]);

  const handleDeactivate = useCallback(() => {
    setMenuOpen(false);
    setDeactivateOpen(true);
  }, []);

  const executeDeactivate = useCallback(async () => {
    await deactivateEmployee(emp.id);
    setDeactivateOpen(false);
    navigate("/employees");
  }, [emp, navigate]);

  const handleMoreClick = useCallback(() => {
    if (!moreRef.current) return;
    const rect = moreRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setMenuOpen(v => !v);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e) {
      if (menuPanelRef.current && !menuPanelRef.current.contains(e.target) &&
          moreRef.current && !moreRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  if (loadError) return (
    <div className="max-w-xl mx-auto mt-20 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-lg font-semibold text-slate-700 mb-2">Could not load employee</h2>
      <p className="text-sm text-slate-500 mb-6">{loadError}</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
        Retry
      </button>
    </div>
  );
  if (!emp) return <ProfileSkeleton />;

  return (
    <div className="max-w-6xl">
      {/* Hero */}
      <ProfileHero
        emp={emp}
        onDeactivate={handleDeactivate}
        moreRef={moreRef}
        onMoreClick={handleMoreClick}
      />

      {/* KPI strip */}
      <KpiStrip emp={emp} />

      {/* Body */}
      <div className="flex gap-5 items-start">
        {/* Sidebar */}
        <ProfileSidebar emp={emp} onDeactivate={handleDeactivate} />

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 mb-5" role="tablist" aria-label="Employee profile sections">
            {TABS.map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`tabpanel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-150 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 ${
                  activeTab === tab.key
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <Ico d={tab.icon} size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          <div id={`tabpanel-${activeTab}`} role="tabpanel">
            {activeTab === "overview"  && <OverviewTab  emp={emp} />}
            {activeTab === "documents" && <DocumentsTab emp={emp} />}
            {activeTab === "bank"      && <BankTab      emp={emp} />}
            {activeTab === "statutory" && <StatutoryTab emp={emp} />}
            {activeTab === "salary"    && (
              <SalaryTab
                emp={emp}
                onRevisionChange={(newCtc) => setEmp(prev => ({ ...prev, ctc: newCtc }))}
              />
            )}
          </div>
        </div>
      </div>

      {/* Deactivate dialog */}
      <DeactivateDialog
        open={deactivateOpen}
        emp={emp}
        onConfirm={executeDeactivate}
        onCancel={() => setDeactivateOpen(false)}
      />

      {/* More actions menu */}
      {menuOpen && createPortal(
        <div
          ref={menuPanelRef}
          role="menu"
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-52"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <Link
            to={`/employees/${emp.id}/edit`}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full text-left transition-colors"
          >
            <Ico d={P.pencil} size={15} className="text-slate-400" /> Edit Profile
          </Link>
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); window.print(); }}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full text-left transition-colors"
          >
            <Ico d={P.print} size={15} className="text-slate-400" /> Print Profile
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            role="menuitem"
            onClick={handleDeactivate}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full text-left transition-colors"
          >
            <Ico d={P.x} size={15} className="text-red-400" /> Deactivate
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
