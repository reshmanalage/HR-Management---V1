import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  listCycles,
  listEmployeesInCycle,
  listAttendanceRecords,
  updateAttendanceRecord,
  listNonBiometricEmployees,
  addManualAttendance,
  addManualBulk,
} from "../../services/attendanceService";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmt(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${((hour % 12) || 12).toString().padStart(2, "0")}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}
function fmtShort(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${((hour % 12) || 12)}:${m}${hour >= 12 ? "p" : "a"}`;
}
function fmtDuration(mins) {
  if (!mins) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}
function dayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day:   d.toLocaleDateString("en-IN", { weekday: "short" }),
    full:  d.toLocaleDateString("en-IN", { weekday: "long" }),
    num:   d.getDate(),
    month: d.toLocaleDateString("en-IN", { month: "short" }),
    year:  d.getFullYear(),
    dow:   d.getDay(), // 0=Sun
  };
}
function nameInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}
function nameColor(name = "") {
  const palette = ["bg-indigo-500","bg-violet-500","bg-pink-500","bg-teal-500","bg-sky-500","bg-rose-500","bg-amber-500"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return palette[h % palette.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_META = {
  P:   { label: "Present",       bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-200", row: "",                  calBg: "bg-emerald-500", calText: "text-white"         },
  WOP: { label: "Work on Off",   bg: "bg-sky-50",      text: "text-sky-700",     dot: "bg-sky-500",     ring: "ring-sky-200",     row: "bg-sky-50/40",       calBg: "bg-sky-400",     calText: "text-white"         },
  WO:  { label: "Week Off",      bg: "bg-slate-100",   text: "text-slate-500",   dot: "bg-slate-300",   ring: "ring-slate-200",   row: "bg-slate-50",        calBg: "bg-slate-200",   calText: "text-slate-500"     },
  A:   { label: "Absent",        bg: "bg-red-50",      text: "text-red-600",     dot: "bg-red-400",     ring: "ring-red-200",     row: "bg-red-50/30",       calBg: "bg-red-400",     calText: "text-white"         },
  MP:  { label: "Missing Punch", bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-400",   ring: "ring-amber-200",   row: "bg-amber-50/60",     calBg: "bg-amber-300",   calText: "text-amber-900"     },
};

function getRecordMeta(rec) {
  if (!rec) return null;
  if (rec.status === "A")  return STATUS_META.A;
  if (rec.status === "WO") return STATUS_META.WO;
  const incomplete = !rec.in_time || !rec.out_time;
  if (incomplete) return STATUS_META.MP;
  return rec.status === "WOP" ? STATUS_META.WOP : STATUS_META.P;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const PATHS = {
  check:    "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  checkSm:  "M5 13l4 4L19 7",
  x:        "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  xSm:      "M6 18L18 6M6 6l12 12",
  warn:     "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  clock:    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  pause:    "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  back:     "M15 19l-7-7 7-7",
  user:     "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  upload:   "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  dots:     "M5 12h.01M12 12h.01M19 12h.01",
  star:     "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  trend:    "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  info:     "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  edit:     "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  search:   "M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z",
  lightning:"M13 10V3L4 14h7v7l9-11h-7z",
  absent:   "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
  plus:     "M12 4v16m8-8H4",
};
function Ico({ d, className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRow helper for tooltips
// ─────────────────────────────────────────────────────────────────────────────
function TRow({ label, value, miss }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <span className={miss ? "text-amber-400 font-medium" : "text-white"}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip (shared portal component)
// ─────────────────────────────────────────────────────────────────────────────
function AttTooltip({ tip }) {
  if (!tip) return null;
  const { rec, dateStr, x, y } = tip;
  if (!rec && !dateStr) return null;
  const meta = rec ? getRecordMeta(rec) : null;
  const { full, num, month, year } = dateStr ? dayLabel(dateStr) : {};
  return createPortal(
    <div
      style={{ position: "fixed", left: x, top: y, transform: "translate(-50%, -100%) translateY(-8px)", zIndex: 9999, pointerEvents: "none" }}
      className="bg-slate-900 text-white text-xs rounded-xl px-4 py-3 shadow-2xl min-w-[190px]"
    >
      <p className="font-semibold text-slate-100 mb-2">{full}, {num} {month} {year}</p>
      {meta && (
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
          <span className="font-medium">{meta.label}</span>
        </div>
      )}
      {rec && rec.status !== "WO" && (
        <div className="border-t border-slate-700 pt-2 space-y-1.5">
          <TRow label="Check In"  value={rec.in_time  ? fmt(rec.in_time)  : "Missing"} miss={!rec.in_time}  />
          <TRow label="Check Out" value={rec.out_time ? fmt(rec.out_time) : "Missing"} miss={!rec.out_time} />
          {rec.duration_minutes > 0 && <TRow label="Hours" value={fmtDuration(rec.duration_minutes)} />}
        </div>
      )}
      {!rec && <p className="text-slate-500 text-[11px]">No record</p>}
      <div style={{ position:"absolute", bottom:-5, left:"50%", transform:"translateX(-50%)" }} className="w-2.5 h-2.5 bg-slate-900 rotate-45" />
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend
// ─────────────────────────────────────────────────────────────────────────────
const LEGEND_ITEMS = [
  { key:"P", label:"Present" }, { key:"A", label:"Absent" },
  { key:"WO", label:"Week Off" }, { key:"WOP", label:"Work on Off" }, { key:"MP", label:"Missing Punch" },
];
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {LEGEND_ITEMS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-sm shrink-0 ${STATUS_META[key].calBg}`} />
          <span className="text-[11px] text-slate-500">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary cards — grid (team) overview
// ─────────────────────────────────────────────────────────────────────────────
function SummaryCards({ records, empList }) {
  const stats = useMemo(() => {
    const present = records.filter(r => r.status === "P" || r.status === "WOP").length;
    const absent  = records.filter(r => r.status === "A").length;
    const off     = records.filter(r => r.status === "WO" || r.status === "WOP").length;
    const missing = records.filter(r => (r.status === "P" || r.status === "WOP") && (!r.in_time || !r.out_time)).length;
    return { employees: empList.length, present, absent, off, missing };
  }, [records, empList]);

  const cards = [
    { label:"Total Employees", value:stats.employees, icon:PATHS.user,     iconBg:"bg-indigo-50",  iconCl:"text-indigo-500",  vc:"text-indigo-700",  accent:"border-l-indigo-400"  },
    { label:"Present Records", value:stats.present,   icon:PATHS.checkSm,  iconBg:"bg-emerald-50", iconCl:"text-emerald-600", vc:"text-emerald-700", accent:"border-l-emerald-400" },
    { label:"Absent Records",  value:stats.absent,    icon:PATHS.absent,   iconBg:"bg-red-50",     iconCl:"text-red-500",     vc:"text-red-600",     accent:"border-l-red-400"     },
    { label:"Week Offs",       value:stats.off,       icon:PATHS.pause,    iconBg:"bg-slate-100",  iconCl:"text-slate-500",   vc:"text-slate-600",   accent:"border-l-slate-300"   },
    { label:"Missing Punches", value:stats.missing,   icon:PATHS.warn,     iconBg:"bg-amber-50",   iconCl:"text-amber-500",   vc:"text-amber-700",   accent:"border-l-amber-400",  alert:true },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label}
          className={`bg-white rounded-xl border border-l-[3px] relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-px ${
            c.alert && c.value > 0
              ? `border-amber-200 bg-amber-50/20 ${c.accent}`
              : `border-slate-200 ${c.accent}`
          } px-4 py-3`}
        >
          <div className={`absolute top-3 right-3 w-7 h-7 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
            <Ico d={c.icon} className={`w-3.5 h-3.5 ${c.iconCl}`} />
          </div>
          <p className="text-[11px] text-slate-400 font-medium mb-1.5 pr-9 leading-tight tracking-wide uppercase">{c.label}</p>
          <p className={`text-2xl font-bold tabular-nums leading-none ${c.vc}`}>{c.value}</p>
          {c.alert && c.value > 0 && (
            <span className="absolute bottom-3 right-3 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SummaryTable — dual-axis sticky grid
// ─────────────────────────────────────────────────────────────────────────────
function SummaryTable({ empList, dateList, grid, onSelect, search }) {
  const [tooltip, setTooltip] = useState(null);
  const hideTimer = useRef(null);
  const filtered = useMemo(() => {
    if (!search.trim()) return empList;
    const q = search.toLowerCase();
    return empList.filter(e => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  }, [empList, search]);

  function showTip(e, rec, dateStr) {
    clearTimeout(hideTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ rec, dateStr, x: rect.left + rect.width / 2, y: rect.top - 8 });
  }
  function hideTip() { hideTimer.current = setTimeout(() => setTooltip(null), 80); }

  return (
    <div className="h-full flex flex-col gap-2">
      <AttTooltip tip={tooltip} />
      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="text-xs border-separate border-spacing-0" style={{ minWidth: dateList.length * 82 + 240 }}>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-5 py-3.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap min-w-[240px]">
                Employee
              </th>
              {dateList.map(d => {
                const { day, num } = dayLabel(d);
                const weekend = isWeekend(d);
                return (
                  <th key={d} className={`sticky top-0 z-20 border-b border-slate-200 px-1 py-3 text-center whitespace-nowrap w-[82px] ${weekend ? "bg-slate-100" : "bg-slate-50"}`}>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{day}</p>
                    <p className={`text-[13px] font-bold mt-0.5 ${weekend ? "text-slate-400" : "text-slate-700"}`}>{num}</p>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp, idx) => (
              <tr key={emp.code} className={`group ${idx % 2 === 1 ? "bg-slate-50" : "bg-white"}`}>
                <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-5 py-3 whitespace-nowrap transition-colors ${
                  idx % 2 === 1 ? "bg-slate-50 group-hover:bg-indigo-50" : "bg-white group-hover:bg-indigo-50"
                }`}>
                  <button onClick={() => onSelect(emp.code)} className="font-semibold text-indigo-600 hover:text-indigo-800 text-left leading-tight text-[13px] transition-colors">
                    {emp.name}
                  </button>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{emp.code}</p>
                </td>
                {dateList.map(d => {
                  const rec  = emp.days[d];
                  const meta = getRecordMeta(rec);
                  const weekend = isWeekend(d);
                  if (!rec) return (
                    <td key={d} className={`border-b border-slate-100 px-1 py-2 text-center ${weekend ? "bg-slate-50" : ""}`}>
                      <span className="text-slate-200 text-[11px]">·</span>
                    </td>
                  );
                  return (
                    <td key={d}
                      className={`border-b border-slate-100 px-1 py-0 text-center cursor-default transition-all hover:brightness-95 hover:z-10 ${meta.bg}`}
                      onMouseEnter={e => showTip(e, rec, d)} onMouseLeave={hideTip}
                    >
                      {(rec.status === "A" || rec.status === "WO") ? (
                        <span className={`block text-[10px] font-semibold py-3 tracking-wide ${meta.text}`}>
                          {rec.status === "A" ? "Absent" : "Off"}
                        </span>
                      ) : (
                        <div className="py-2 px-1">
                          <p className={`text-[10px] font-semibold leading-tight tabular-nums ${rec.in_time ? meta.text : "text-amber-600"}`}>
                            {rec.in_time ? fmtShort(rec.in_time) : "—"}
                          </p>
                          <p className={`text-[10px] leading-tight tabular-nums mt-0.5 ${rec.out_time ? "text-slate-400" : "text-amber-500"}`}>
                            {rec.out_time ? fmtShort(rec.out_time) : "—"}
                          </p>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={dateList.length + 1} className="py-16 text-center text-sm text-slate-400">
                  No employees match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 px-1 shrink-0">
        <span className="text-[11px] text-slate-400 font-semibold">Legend:</span>
        <Legend />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Heatmap — replaces bar chart
// ─────────────────────────────────────────────────────────────────────────────
const CAL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function CalendarHeatmap({ days, dateList }) {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);
  if (!dateList.length) return null;

  // Build week grid starting from Monday of the first cycle date
  const cycleSet = new Set(dateList);
  const firstDate = new Date(dateList[0] + "T00:00:00");
  const lastDate  = new Date(dateList[dateList.length - 1] + "T00:00:00");

  // Find Monday on or before firstDate
  const dow = firstDate.getDay(); // 0=Sun
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const gridStart = new Date(firstDate);
  gridStart.setDate(gridStart.getDate() + offsetToMon);

  const allGridDates = [];
  const cur = new Date(gridStart);
  while (cur <= lastDate) {
    allGridDates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let i = 0; i < allGridDates.length; i += 7) weeks.push(allGridDates.slice(i, i + 7));

  function cellMeta(dateStr) {
    if (!cycleSet.has(dateStr)) return null;
    const rec = days[dateStr];
    return getRecordMeta(rec) ?? null;
  }

  function showTip(e, dateStr) {
    if (!cycleSet.has(dateStr)) return;
    clearTimeout(timer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ rec: days[dateStr] ?? null, dateStr, x: rect.left + rect.width / 2, y: rect.top - 6 });
  }
  function hideTip() { timer.current = setTimeout(() => setTip(null), 80); }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 pt-4 pb-5">
      <AttTooltip tip={tip} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Attendance Calendar</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{dateList.length}-day cycle view</p>
        </div>
        <Legend />
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 7 * 36 + 6 * 4 }}>
          {/* Day headers */}
          <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns:"repeat(7,1fr)" }}>
            {CAL_DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          {/* Week rows */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid gap-1" style={{ gridTemplateColumns:"repeat(7,1fr)" }}>
                {week.map(dateStr => {
                  const meta    = cellMeta(dateStr);
                  const inCycle = cycleSet.has(dateStr);
                  const { num } = dayLabel(dateStr);
                  return (
                    <div
                      key={dateStr}
                      onMouseEnter={e => showTip(e, dateStr)}
                      onMouseLeave={hideTip}
                      className={`relative aspect-square rounded-lg flex items-center justify-center select-none transition-transform ${
                        inCycle
                          ? `cursor-default hover:scale-110 hover:shadow-sm ${meta?.calBg ?? "bg-slate-100"}`
                          : "bg-transparent"
                      }`}
                    >
                      {inCycle && (
                        <span className={`text-[11px] font-bold ${meta?.calText ?? "text-slate-500"}`}>{num}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance Insights
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceInsights({ allDays, absent, missing, wopDays }) {
  const insights = useMemo(() => {
    const list = [];
    if (absent === 0 && missing === 0) {
      list.push({ icon:"✅", text:"Perfect attendance — no absences or missing punches", cls:"text-emerald-700 bg-emerald-50 border-emerald-100" });
    }
    if (missing > 0) {
      list.push({ icon:"⚠️", text:`${missing} missing punch${missing > 1 ? "es" : ""} need regularization`, cls:"text-amber-700 bg-amber-50 border-amber-100", badge:"Needs Action" });
    }
    if (absent > 0) {
      list.push({ icon:"❌", text:`${absent} absent day${absent > 1 ? "s" : ""} this cycle`, cls:"text-red-700 bg-red-50 border-red-100" });
    }
    if (wopDays > 0) {
      list.push({ icon:"💪", text:`Worked on ${wopDays} week off${wopDays > 1 ? "s" : ""}`, cls:"text-sky-700 bg-sky-50 border-sky-100" });
    }
    const durList = allDays.filter(r => r.duration_minutes > 0).map(r => r.duration_minutes);
    if (durList.length > 0) {
      const avg = Math.round(durList.reduce((a, b) => a + b, 0) / durList.length);
      const max = Math.max(...durList);
      list.push({ icon:"⏱", text:`Average working hours: ${fmtDuration(avg)}`, cls:"text-slate-600 bg-slate-50 border-slate-100" });
      if (max > avg + 30) {
        list.push({ icon:"🏆", text:`Longest shift: ${fmtDuration(max)}`, cls:"text-indigo-700 bg-indigo-50 border-indigo-100" });
      }
    }
    return list;
  }, [allDays, absent, missing, wopDays]);

  if (!insights.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-sm font-semibold text-slate-800 mb-3">Attendance Insights</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {insights.map((item, i) => (
          <div key={i} className={`flex items-start gap-2.5 border rounded-lg px-3.5 py-2.5 ${item.cls}`}>
            <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-snug">{item.text}</p>
              {item.badge && (
                <span className="inline-block mt-1 text-[10px] font-semibold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — detail view, with progress bar option
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, trend, color, bg, iconColor, progress, alert }) {
  return (
    <div className={`rounded-xl border bg-white px-4 py-4 flex-1 min-w-[120px] transition-all hover:shadow-md hover:-translate-y-px relative overflow-hidden ${
      alert ? "border-amber-200 bg-amber-50/20" : "border-slate-200"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
          <Ico d={icon} className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        {alert && value > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mt-1" />
        )}
      </div>
      <p className={`text-[26px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-1.5 font-medium leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      {trend && (
        <p className={`text-[10px] mt-1.5 font-semibold ${trend.up ? "text-emerald-600" : "text-slate-400"}`}>
          {trend.up ? "▲" : "▼"} {trend.text}
        </p>
      )}
      {progress !== undefined && (
        <div className="mt-2.5 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              progress >= 90 ? "bg-emerald-400" : progress >= 75 ? "bg-amber-400" : "bg-red-400"
            }`}
            style={{ width:`${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance Rating Card — fixed >100% display issue
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceRatingCard({ pDays, wopDays, absent, dateList }) {
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef(null);

  const scheduledDays = pDays + absent;
  const workedDays    = pDays + wopDays;
  const ratingPct     = scheduledDays > 0 ? Math.round((pDays / scheduledDays) * 100) : 0;

  const ratingLabel = ratingPct >= 95 ? "Excellent"
    : ratingPct >= 85 ? "Good"
    : ratingPct >= 75 ? "Satisfactory"
    : "Below Target";
  const ratingColor = ratingPct >= 95 ? "text-emerald-600"
    : ratingPct >= 85 ? "text-indigo-600"
    : ratingPct >= 75 ? "text-amber-600"
    : "text-red-600";
  const ringColor   = ratingPct >= 95 ? "#10b981"
    : ratingPct >= 85 ? "#6366f1"
    : ratingPct >= 75 ? "#f59e0b"
    : "#ef4444";
  const stars       = ratingPct >= 95 ? 5 : ratingPct >= 85 ? 4 : ratingPct >= 75 ? 3 : 2;

  const r = 22, circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, ratingPct) / 100);

  useEffect(() => {
    if (!showInfo) return;
    function close(e) { if (infoRef.current && !infoRef.current.contains(e.target)) setShowInfo(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showInfo]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center gap-4 flex-1 min-w-[200px] transition-shadow hover:shadow-md relative">
      {/* Ring */}
      <svg width={60} height={60} viewBox="0 0 60 60" className="shrink-0">
        <circle cx={30} cy={30} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
        <circle cx={30} cy={30} r={r} fill="none" stroke={ringColor} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 30 30)" style={{ transition:"stroke-dashoffset 0.8s ease" }}
        />
        <text x={30} y={35} textAnchor="middle" fontSize={12} fontWeight={800} fill={ringColor}>{ratingPct}%</text>
      </svg>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className={`text-sm font-bold ${ratingColor}`}>{ratingLabel}</p>
          <button onClick={() => setShowInfo(v => !v)}
            className="text-slate-300 hover:text-slate-500 transition-colors"
            aria-label="Attendance calculation info"
          >
            <Ico d={PATHS.info} className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Stars */}
        <div className="flex gap-0.5 mb-2">
          {Array.from({ length:5 }).map((_, i) => (
            <svg key={i} className={`w-3 h-3 ${i < stars ? "text-amber-400" : "text-slate-200"}`}
              fill="currentColor" viewBox="0 0 24 24">
              <path d={PATHS.star} />
            </svg>
          ))}
        </div>
        <div className="space-y-0.5 text-[10px] text-slate-500">
          <p><span className="font-medium text-slate-600">{scheduledDays}</span> Scheduled Days</p>
          <p><span className="font-medium text-slate-600">{pDays}</span> Days Present</p>
          {wopDays > 0 && <p><span className="font-medium text-sky-600">+{wopDays}</span> Extra (WOP)</p>}
        </div>
      </div>

      {/* Info popover */}
      {showInfo && (
        <div ref={infoRef}
          className="absolute right-0 top-full mt-2 z-20 bg-slate-900 text-white text-xs rounded-xl px-4 py-3 shadow-2xl w-64"
        >
          <p className="font-semibold mb-2 text-slate-100">How is this calculated?</p>
          <p className="text-slate-400 leading-relaxed">
            <span className="text-white">Attendance % = Days Present ÷ Scheduled Days × 100</span>
            <br /><br />
            Scheduled Days = Present + Absent (excludes Week Offs &amp; WOP).
            WOP (Work on Off) days are extra and shown separately — they don't inflate your score.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row action menu (portal)
// ─────────────────────────────────────────────────────────────────────────────
function RowActionMenu({ rec, dateStr, onEdit, onRegularize, onDownload, onClose }) {
  const ref = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    // Position relative to trigger
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ x: r.right, y: r.bottom + 4 });
    }
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  const meta = getRecordMeta(rec);
  const isMissing = meta?.label === "Missing Punch";
  const { day, num, month } = dayLabel(dateStr);

  return (
    <>
      <span ref={btnRef} />
      {pos && createPortal(
        <div
          ref={ref}
          style={{ position:"fixed", left:pos.x, top:pos.y, transform:"translateX(-100%)", zIndex:9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 min-w-[180px] text-sm"
        >
          <p className="px-4 py-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-widest border-b border-slate-100 mb-1">
            {day}, {num} {month}
          </p>
          <button onClick={() => { onEdit(); onClose(); }}
            className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <Ico d={PATHS.edit} className="w-3.5 h-3.5 text-slate-400" />
            Edit Record
          </button>
          {isMissing && (
            <button onClick={() => { onRegularize(); onClose(); }}
              className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-amber-50 text-amber-700 transition-colors font-medium"
            >
              <Ico d={PATHS.warn} className="w-3.5 h-3.5 text-amber-400" />
              Regularize Punch
            </button>
          )}
          <div className="border-t border-slate-100 my-1" />
          <button onClick={() => { onDownload(); onClose(); }}
            className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-500 transition-colors"
          >
            <Ico d={PATHS.download} className="w-3.5 h-3.5 text-slate-400" />
            Download Record
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export CSV helpers
// ─────────────────────────────────────────────────────────────────────────────
function exportDetailCSV(emp, days, dateList) {
  const headers = ["Date","Day","Status","In Time","Out Time","Duration","Notes"];
  const rows = dateList.map(d => {
    const rec = days[d];
    const { full, num, month, year } = dayLabel(d);
    const meta = getRecordMeta(rec);
    const notes = rec && (rec.status === "P" || rec.status === "WOP")
      ? [!rec.in_time && "Missing In", !rec.out_time && "Missing Out"].filter(Boolean).join("; ")
      : "";
    return [`${num} ${month} ${year}`, full, meta?.label ?? (rec?.status ?? "No Record"),
      rec?.in_time ? fmt(rec.in_time) : "", rec?.out_time ? fmt(rec.out_time) : "",
      rec?.duration_minutes ? fmtDuration(rec.duration_minutes) : "", notes];
  });
  const csv = [headers,...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv],{type:"text/csv"})),
    download:`attendance_${emp.code}_${dateList[0]??""}.csv`,
  }).click();
}

function exportSingleRowCSV(emp, rec, dateStr) {
  const { full, num, month, year } = dayLabel(dateStr);
  const meta = getRecordMeta(rec);
  const notes = rec && (rec.status === "P" || rec.status === "WOP")
    ? [!rec.in_time && "Missing In", !rec.out_time && "Missing Out"].filter(Boolean).join("; ") : "";
  const headers = ["Employee","Code","Date","Day","Status","In Time","Out Time","Duration","Notes"];
  const row = [emp.name, emp.code, `${num} ${month} ${year}`, full, meta?.label ?? rec?.status ?? "",
    rec?.in_time ? fmt(rec.in_time) : "", rec?.out_time ? fmt(rec.out_time) : "",
    rec?.duration_minutes ? fmtDuration(rec.duration_minutes) : "", notes];
  const csv = [headers, row].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv],{type:"text/csv"})),
    download:`record_${emp.code}_${dateStr}.csv`,
  }).click();
}

// ─────────────────────────────────────────────────────────────────────────────
// SingleEmployeeView — enterprise redesign, all business logic unchanged
// ─────────────────────────────────────────────────────────────────────────────
const MAX_MINS = 600;

function SingleEmployeeView({ emp, dateList, onBack }) {
  const [days,      setDays]      = useState(() => emp?.days ?? {});
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({ in_time:"", out_time:"", status:"" });
  const [saving,    setSaving]    = useState(false);
  const [actionMenu, setActionMenu] = useState(null); // { rec, dateStr, triggerEl }
  const [rowTip,    setRowTip]    = useState(null);
  const tipTimer = useRef(null);

  if (!emp) return null;

  // ── KPI derivations (business logic unchanged + new breakdowns) ──────────
  const allDays   = Object.values(days);
  const present   = allDays.filter(r => r.status === "P" || r.status === "WOP").length;
  const absent    = allDays.filter(r => r.status === "A").length;
  const wo        = allDays.filter(r => r.status === "WO" || r.status === "WOP").length;
  const missing   = allDays.filter(r => (r.status === "P" || r.status === "WOP") && (!r.in_time || !r.out_time)).length;

  // Additional breakdown (not changing existing logic above)
  const wopDays   = allDays.filter(r => r.status === "WOP").length;
  const pDays     = allDays.filter(r => r.status === "P").length;
  const workDays  = dateList.length - wo; // original (kept for table footer)
  const scheduledDays = pDays + absent;
  const attPct    = scheduledDays > 0 ? Math.round((pDays / scheduledDays) * 100) : 0;

  // ── Edit handlers (unchanged) ───────────────────────────────────────────
  function startEdit(rec) {
    setEditingId(rec.id);
    setEditForm({ in_time: rec.in_time ?? "", out_time: rec.out_time ?? "", status: rec.status ?? "" });
    setActionMenu(null);
  }
  function cancelEdit() { setEditingId(null); }
  async function saveEdit(rec) {
    setSaving(true);
    try {
      const updated = await updateAttendanceRecord(rec.id, {
        in_time:  editForm.in_time  || null,
        out_time: editForm.out_time || null,
        status:   editForm.status   || null,
      });
      setDays(prev => ({ ...prev, [rec.date]: updated }));
      setEditingId(null);
    } finally { setSaving(false); }
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────
  function showRowTip(e, rec, dateStr) {
    clearTimeout(tipTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setRowTip({ rec, dateStr, x: rect.left + rect.width / 2, y: rect.top - 6 });
  }
  function hideRowTip() { tipTimer.current = setTimeout(() => setRowTip(null), 80); }

  const hasMissingPunch = (rec) =>
    rec && (rec.status === "P" || rec.status === "WOP") && (!rec.in_time || !rec.out_time);

  return (
    <div className="space-y-4">
      <AttTooltip tip={rowTip} />

      {/* ── 1. Employee profile card ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={onBack} aria-label="Back"
            className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 h-8 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 shrink-0"
          >
            <Ico d={PATHS.back} className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">Back</span>
          </button>
          <div className="w-px h-8 bg-slate-100 hidden sm:block" />

          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${nameColor(emp.name)}`}>
            {nameInitials(emp.name)}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-slate-800 leading-tight truncate">{emp.name}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{emp.code}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                attPct >= 90 ? "bg-emerald-100 text-emerald-700" :
                attPct >= 75 ? "bg-indigo-100 text-indigo-700" :
                "bg-red-100 text-red-700"
              }`}>
                {attPct}% Attendance
              </span>
              {missing > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  ⚠ {missing} Missing Punch{missing > 1 ? "es" : ""}
                </span>
              )}
            </div>
          </div>

          <button onClick={() => exportDetailCSV(emp, days, dateList)}
            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[13px] font-medium px-3.5 h-9 rounded-lg transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Ico d={PATHS.download} className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── 2. KPI cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={PATHS.calendar} label="Working Days"  value={dateList.length}
          sub={`${wo} week off${wo !== 1 ? "s" : ""}`}
          color="text-indigo-600" bg="bg-indigo-50" iconColor="text-indigo-500"
        />
        <KpiCard icon={PATHS.checkSm} label="Present Days"  value={pDays}
          sub={`${attPct}% of scheduled`}
          trend={{ up: attPct >= 90, text: attPct >= 90 ? "On track" : "Needs improvement" }}
          color="text-emerald-600" bg="bg-emerald-50" iconColor="text-emerald-500"
          progress={attPct}
        />
        <KpiCard icon={PATHS.absent}  label="Absent Days"   value={absent}
          sub={absent > 0 ? `${Math.round((absent / scheduledDays) * 100)}% of scheduled` : "No absences"}
          color="text-red-600" bg="bg-red-50" iconColor="text-red-400"
        />
        <KpiCard icon={PATHS.pause}   label="Week Off"      value={wo}
          sub="Scheduled rest days"
          color="text-slate-600" bg="bg-slate-100" iconColor="text-slate-400"
        />
        <KpiCard icon={PATHS.lightning} label="Work on Off" value={wopDays}
          sub="Extra working days"
          color="text-sky-600" bg="bg-sky-50" iconColor="text-sky-500"
        />
        <KpiCard icon={PATHS.warn}    label="Missing Punch" value={missing}
          sub={missing > 0 ? "Regularization needed" : "All punches complete"}
          color="text-amber-600" bg="bg-amber-50" iconColor="text-amber-500"
          alert={missing > 0}
        />
      </div>

      {/* ── 3. Attendance rating card ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <AttendanceRatingCard pDays={pDays} wopDays={wopDays} absent={absent} dateList={dateList} />
      </div>

      {/* ── 4. Insights ─────────────────────────────────────────────────── */}
      <AttendanceInsights allDays={allDays} absent={absent} missing={missing} wopDays={wopDays} />

      {/* ── 5. Calendar heatmap ──────────────────────────────────────────── */}
      <CalendarHeatmap days={days} dateList={dateList} />

      {/* ── 6. Attendance table ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table header toolbar */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-slate-800">Attendance Detail</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{dateList.length} days · {workDays} working</p>
          </div>
          {missing > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {missing} punch{missing > 1 ? "es" : ""} need review
            </span>
          )}
        </div>

        <div className="overflow-auto" style={{ maxHeight:"calc(100vh - 200px)" }}>
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                {["Date","Status","Check In","Check Out","Working Hours","Actions"].map((h, i) => (
                  <th key={h} className={`border-b border-slate-100 bg-slate-50/80 py-3.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest ${
                    i === 0 ? "text-left px-5" : i === 5 ? "px-4 w-20" : "text-center px-4"
                  }`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dateList.map((d, idx) => {
                const rec       = days[d];
                const isEditing = rec && editingId === rec.id;
                const isPresent = rec && rec.status !== "A" && rec.status !== "WO";
                const meta      = getRecordMeta(rec);
                const weekend   = isWeekend(d);
                const isMissing = hasMissingPunch(rec);
                const { day, num, month } = dayLabel(d);

                // Row tinting priority: editing > missing punch > absent > weekend > zebra
                const rowBg = isEditing     ? "bg-indigo-50"
                  : isMissing              ? "bg-amber-50/70"
                  : meta?.row === "bg-red-50/30" ? "bg-red-50/30"
                  : weekend                ? "bg-slate-50/50"
                  : idx % 2 === 1          ? "bg-slate-50/25"
                  : "bg-white";

                if (isEditing) {
                  return (
                    <tr key={d} className="bg-indigo-50 border-b border-indigo-100">
                      <td className="px-5 py-3 font-semibold text-slate-700 whitespace-nowrap">
                        <span className="text-slate-400 text-xs mr-1.5">{day}</span>{num} {month}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <select value={editForm.status}
                          onChange={e => setEditForm(f => ({ ...f, status:e.target.value }))}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                          aria-label="Status"
                        >
                          {["P","A","WO","WOP"].map(s => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input type="time" value={editForm.in_time}
                          onChange={e => setEditForm(f => ({ ...f, in_time:e.target.value }))}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          aria-label="Check in time"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input type="time" value={editForm.out_time}
                          onChange={e => setEditForm(f => ({ ...f, out_time:e.target.value }))}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          aria-label="Check out time"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-300 text-xs">—</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => saveEdit(rec)} disabled={saving}
                          className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg mr-1.5 disabled:opacity-50 transition-colors font-medium"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={cancelEdit}
                          className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={d}
                    className={`group border-b border-slate-100/80 transition-colors ${rowBg} ${isMissing ? "hover:bg-amber-50" : "hover:bg-slate-50/70"}`}
                    onMouseEnter={e => rec && showRowTip(e, rec, d)}
                    onMouseLeave={hideRowTip}
                  >
                    {/* Date */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {weekend && <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" title="Weekend" />}
                        <div>
                          <span className="text-[11px] text-slate-400 font-medium">{day}</span>
                          <span className="text-slate-700 font-semibold text-sm ml-1.5 tabular-nums">{num} {month}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      {rec ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${meta?.bg} ${meta?.text} ${meta?.ring}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta?.dot}`} />
                            {meta?.label ?? rec.status}
                          </span>
                          {isMissing && (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                              Needs Regularization
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-300">No Record</span>
                      )}
                    </td>

                    {/* Check In */}
                    <td className="px-4 py-3.5 text-center">
                      {rec ? (
                        <div className="flex flex-col items-center">
                          {isPresent && !rec.in_time && (
                            <Ico d={PATHS.warn} className="w-3.5 h-3.5 text-amber-400 mb-0.5" />
                          )}
                          <span className={`font-semibold tabular-nums text-sm ${
                            rec.in_time ? "text-slate-700" : isPresent ? "text-amber-500" : "text-slate-300"
                          }`}>
                            {rec.in_time ? fmt(rec.in_time) : isPresent ? "Missing" : "—"}
                          </span>
                        </div>
                      ) : <span className="text-slate-300 text-sm">—</span>}
                    </td>

                    {/* Check Out */}
                    <td className="px-4 py-3.5 text-center">
                      {rec ? (
                        <div className="flex flex-col items-center">
                          {isPresent && !rec.out_time && (
                            <Ico d={PATHS.warn} className="w-3.5 h-3.5 text-amber-400 mb-0.5" />
                          )}
                          <span className={`font-semibold tabular-nums text-sm ${
                            rec.out_time ? "text-slate-700" : isPresent ? "text-amber-500" : "text-slate-300"
                          }`}>
                            {rec.out_time ? fmt(rec.out_time) : isPresent ? "Missing" : "—"}
                          </span>
                        </div>
                      ) : <span className="text-slate-300 text-sm">—</span>}
                    </td>

                    {/* Working Hours with bar */}
                    <td className="px-4 py-3.5 text-center">
                      {rec?.duration_minutes ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-slate-700 text-sm tabular-nums font-semibold">
                            {fmtDuration(rec.duration_minutes)}
                          </span>
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                rec.duration_minutes >= MAX_MINS ? "bg-emerald-500" :
                                rec.duration_minutes >= 420 ? "bg-indigo-400" : "bg-amber-400"
                              }`}
                              style={{ width:`${Math.min(100,(rec.duration_minutes/MAX_MINS)*100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </td>

                    {/* Actions — overflow menu */}
                    <td className="px-4 py-3.5 text-center">
                      {rec ? (
                        <div className="relative">
                          {isMissing ? (
                            /* Inline regularize button for missing punch rows */
                            <button
                              onClick={() => startEdit(rec)}
                              className="text-[11px] font-semibold text-amber-600 hover:text-amber-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all px-2.5 py-1.5 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                              aria-label={`Regularize ${day} ${num} ${month}`}
                            >
                              Regularize
                            </button>
                          ) : (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setActionMenu(actionMenu?.dateStr === d ? null : { rec, dateStr:d });
                              }}
                              aria-label="Row actions"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                              <Ico d={PATHS.dots} className="w-4 h-4" />
                            </button>
                          )}
                          {actionMenu?.dateStr === d && (
                            <RowActionMenu
                              rec={actionMenu.rec}
                              dateStr={actionMenu.dateStr}
                              onEdit={() => startEdit(actionMenu.rec)}
                              onRegularize={() => startEdit(actionMenu.rec)}
                              onDownload={() => exportSingleRowCSV(emp, actionMenu.rec, actionMenu.dateStr)}
                              onClose={() => setActionMenu(null)}
                            />
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">{dateList.length}</span> days ·&nbsp;
            <span className="font-semibold text-emerald-600">{present}</span> present ·&nbsp;
            <span className="font-semibold text-red-500">{absent}</span> absent
            {missing > 0 && <> · <span className="font-semibold text-amber-600">{missing}</span> missing</>}
          </p>
          <Legend />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({length:5}).map((_,i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 h-16" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="h-10 bg-slate-100 border-b border-slate-200" />
        {Array.from({length:6}).map((_,i) => (
          <div key={i} className="flex gap-px p-2 border-b border-slate-100">
            <div className="w-48 h-8 bg-slate-100 rounded shrink-0" />
            {Array.from({length:10}).map((_,j) => <div key={j} className="flex-1 h-8 bg-slate-50 rounded mx-px" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AttendancePage — all state and API calls unchanged
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all bg-white h-9";

export default function AttendancePage() {
  const [cycles,        setCycles]        = useState([]);
  const [selectedCycle, setSelectedCycle] = useState("");
  const [employees,     setEmployees]     = useState([]);
  const [selectedEmp,   setSelectedEmp]   = useState("");
  const [records,       setRecords]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState("");

  // Manual entry modal
  const [showManual,   setShowManual]   = useState(false);
  const [nonBioEmps,   setNonBioEmps]   = useState([]);
  const [manualEmpId,  setManualEmpId]  = useState("");
  const [manualInTime, setManualInTime] = useState("08:30");
  const [manualOutTime,setManualOutTime]= useState("18:00");
  const [manualDays,   setManualDays]   = useState([]);   // [{ date, status, in_time, out_time }]
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError,  setManualError]  = useState("");

  useEffect(() => {
    listCycles().then(data => {
      setCycles(data);
      if (data.length > 0) setSelectedCycle(data[0].cycle_start);
    });
  }, []);
  useEffect(() => {
    if (!selectedCycle) return;
    listEmployeesInCycle(selectedCycle).then(data => { setEmployees(data); setSelectedEmp(""); });
  }, [selectedCycle]);
  useEffect(() => {
    if (!selectedCycle) return;
    setLoading(true);
    listAttendanceRecords(selectedCycle, selectedEmp || undefined).then(setRecords).finally(() => setLoading(false));
  }, [selectedCycle, selectedEmp]);

  const { empList, dateList, grid } = useMemo(() => {
    if (!records.length) return { empList:[], dateList:[], grid:{} };
    const empMap = {};
    const dateSet = new Set();
    for (const r of records) {
      const key = r.raw_employee_code;
      if (!empMap[key]) empMap[key] = { code:key, name:r.raw_employee_name, days:{} };
      empMap[key].days[r.date] = r;
      dateSet.add(r.date);
    }
    return {
      dateList: Array.from(dateSet).sort(),
      empList:  Object.values(empMap).sort((a,b) => a.name.localeCompare(b.name)),
      grid:     empMap,
    };
  }, [records]);

  const cycleLabel = c => {
    const found = cycles.find(x => x.cycle_start === c);
    return found ? `${found.cycle_start} → ${found.cycle_end}` : c;
  };
  const hasFilters = selectedEmp || search;

  const selectedCycleObj = cycles.find(c => c.cycle_start === selectedCycle);

  function buildDaysForCycle(cycleObj, inTime, outTime) {
    if (!cycleObj) return [];
    const days = [];
    const cur = new Date(cycleObj.cycle_start);
    const end = new Date(cycleObj.cycle_end);
    while (cur <= end) {
      const dow = cur.getDay(); // 0=Sun,6=Sat
      const isWeekend = dow === 0 || dow === 6;
      const dateStr = cur.toISOString().slice(0, 10);
      days.push({
        date: dateStr,
        status: isWeekend ? "WO" : "P",
        in_time:  isWeekend ? null : inTime,
        out_time: isWeekend ? null : outTime,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  async function openManualModal() {
    setManualError("");
    setManualEmpId("");
    const inT = "08:30", outT = "18:00";
    setManualInTime(inT);
    setManualOutTime(outT);
    setManualDays(buildDaysForCycle(selectedCycleObj, inT, outT));
    const emps = await listNonBiometricEmployees().catch(() => []);
    setNonBioEmps(emps);
    setShowManual(true);
  }

  function applyDefaultTimes(inTime, outTime) {
    setManualDays(d => d.map(day =>
      day.status === "P" ? { ...day, in_time: inTime, out_time: outTime } : day
    ));
  }

  function toggleDayStatus(date) {
    setManualDays(d => d.map(day => {
      if (day.date !== date) return day;
      const next = day.status === "P" ? "WO" : day.status === "WO" ? "A" : "P";
      return {
        ...day,
        status:   next,
        in_time:  next === "P" ? manualInTime  : null,
        out_time: next === "P" ? manualOutTime : null,
      };
    }));
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!selectedCycleObj || !manualEmpId) return;
    setManualSaving(true);
    setManualError("");
    try {
      const result = await addManualBulk({
        employee_id: parseInt(manualEmpId),
        cycle_start: selectedCycleObj.cycle_start,
        cycle_end:   selectedCycleObj.cycle_end,
        days: manualDays.map(d => ({
          date:     d.date,
          status:   d.status,
          in_time:  d.in_time  || null,
          out_time: d.out_time || null,
        })),
      });
      setShowManual(false);
      setLoading(true);
      listAttendanceRecords(selectedCycle, selectedEmp || undefined).then(setRecords).finally(() => setLoading(false));
      listEmployeesInCycle(selectedCycle).then(setEmployees);
      if (result.skipped > 0) {
        alert(`Saved ${result.inserted} records. ${result.skipped} date(s) already had records and were skipped.`);
      }
    } catch (err) {
      setManualError(err.response?.data?.detail || "Failed to save attendance records");
    } finally {
      setManualSaving(false);
    }
  }

  if (!loading && cycles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <Ico d={PATHS.upload} className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-base font-bold text-slate-700 mb-1">No attendance data yet</h3>
        <p className="text-sm text-slate-400 mb-6">Import a biometric attendance file to get started.</p>
        <Link to="/attendance/upload"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
        >
          <Ico d={PATHS.upload} className="w-4 h-4" /> Import Attendance
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" style={{ height: "calc(100vh - 100px)" }}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Attendance</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {selectedCycle ? cycleLabel(selectedCycle) : "Payroll cycle overview"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openManualModal}
            disabled={!selectedCycleObj}
            className="inline-flex items-center gap-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[13px] font-medium px-4 h-9 rounded-lg transition-colors shadow-sm disabled:opacity-40"
          >
            <Ico d={PATHS.plus} className="w-3.5 h-3.5" /> Manual Entry
          </button>
          <Link to="/attendance/upload"
            className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[13px] font-medium px-4 h-9 rounded-lg transition-colors shadow-sm"
          >
            <Ico d={PATHS.upload} className="w-3.5 h-3.5" /> Import
          </Link>
        </div>
      </div>

      {/* ── Filter toolbar ────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2 flex flex-wrap items-center gap-2.5">
          {/* Cycle */}
          <div className="flex items-center gap-2 shrink-0">
            <Ico d={PATHS.calendar} className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}
              className={inputCls}
              aria-label="Payroll cycle"
            >
              {cycles.map(c => (
                <option key={c.cycle_start} value={c.cycle_start}>{c.cycle_start} → {c.cycle_end}</option>
              ))}
            </select>
          </div>

          <div className="w-px h-5 bg-slate-100 hidden sm:block" />

          {/* Employee */}
          <div className="flex items-center gap-2 shrink-0">
            <Ico d={PATHS.user} className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}
              className={inputCls + " min-w-[172px]"}
              aria-label="Employee filter"
            >
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.code} value={e.code}>{e.name}</option>)}
            </select>
          </div>

          {/* Search (grid view only) */}
          {!selectedEmp && (
            <>
              <div className="w-px h-5 bg-slate-100 hidden sm:block" />
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Ico d={PATHS.search} className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <input type="text" placeholder="Search employees…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={inputCls + " pl-8 w-52"}
                  aria-label="Search employees"
                />
              </div>
            </>
          )}

          {/* Reset */}
          {hasFilters && (
            <button onClick={() => { setSelectedEmp(""); setSearch(""); }}
              className="inline-flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200 h-9 px-3 rounded-lg transition-colors font-medium"
            >
              <Ico d={PATHS.xSm} className="w-3.5 h-3.5" /> Reset
            </button>
          )}

          {/* Record count badge */}
          {!loading && records.length > 0 && (
            <span className="ml-auto text-[11px] text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg font-medium tabular-nums">
              {empList.length} employees · {dateList.length} days
            </span>
          )}
        </div>
      </div>

      {/* ── Summary cards (grid view) ────────────────────────────────────── */}
      {!loading && !selectedEmp && empList.length > 0 && (
        <div className="shrink-0"><SummaryCards records={records} empList={empList} /></div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <Skeleton />
        ) : empList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-200 h-full">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Ico d={PATHS.upload} className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">No records for this cycle</p>
            <p className="text-xs text-slate-400">Try selecting a different payroll cycle or importing attendance data.</p>
          </div>
        ) : selectedEmp ? (
          <div className="h-full overflow-y-auto pr-1">
            <SingleEmployeeView emp={grid[selectedEmp]} dateList={dateList} onBack={() => setSelectedEmp("")} />
          </div>
        ) : (
          <SummaryTable empList={empList} dateList={dateList} grid={grid} onSelect={setSelectedEmp} search={search} />
        )}
      </div>

      {/* ── Manual entry modal ───────────────────────────────────────────── */}
      {showManual && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: "90vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-800">Manual Attendance — Cycle Entry</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  {selectedCycleObj
                    ? `${selectedCycleObj.cycle_start} → ${selectedCycleObj.cycle_end}`
                    : "For employees not enrolled in biometric device"}
                </p>
              </div>
              <button onClick={() => setShowManual(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <Ico d={PATHS.xSm} className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="flex flex-col flex-1 min-h-0">
              {/* Controls */}
              <div className="px-6 py-4 space-y-3 shrink-0">
                {manualError && (
                  <div className="text-[13px] text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{manualError}</div>
                )}

                {/* Employee */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Employee *</label>
                  {nonBioEmps.length === 0 ? (
                    <p className="text-[13px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      No active employees without biometric enrollment found.
                    </p>
                  ) : (
                    <select required value={manualEmpId}
                      onChange={e => setManualEmpId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">Select employee…</option>
                      {nonBioEmps.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.code})</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Default times */}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Default In Time</label>
                    <input type="time" value={manualInTime}
                      onChange={e => { setManualInTime(e.target.value); applyDefaultTimes(e.target.value, manualOutTime); }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Default Out Time</label>
                    <input type="time" value={manualOutTime}
                      onChange={e => { setManualOutTime(e.target.value); applyDefaultTimes(manualInTime, e.target.value); }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-500">Tap to cycle:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">P</span><span>Present</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">WO</span><span>Week Off</span>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-600 font-semibold">A</span><span>Absent</span>
                </div>
              </div>

              {/* Calendar grid — scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase py-1">{d}</div>
                  ))}
                </div>
                {(() => {
                  if (!manualDays.length) return null;
                  // Pad to start on Monday
                  const firstDow = new Date(manualDays[0].date).getDay(); // 0=Sun
                  const pad = firstDow === 0 ? 6 : firstDow - 1; // days to pad
                  const cells = [...Array(pad).fill(null), ...manualDays];
                  const weeks = [];
                  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                  return weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                      {week.map((day, di) => {
                        if (!day) return <div key={di} />;
                        const num = day.date.slice(8);
                        const statusCls =
                          day.status === "P"  ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                          day.status === "WO" ? "bg-slate-50  border-slate-200  text-slate-400"    :
                                                "bg-red-50    border-red-200    text-red-600";
                        return (
                          <button key={day.date} type="button"
                            onClick={() => toggleDayStatus(day.date)}
                            className={`rounded-lg border text-center py-1.5 transition-all hover:shadow-sm select-none ${statusCls}`}
                          >
                            <p className="text-[11px] font-bold leading-none">{num}</p>
                            <p className="text-[9px] font-semibold mt-0.5 opacity-70">{day.status}</p>
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <p className="text-[12px] text-slate-400">
                  {manualDays.filter(d => d.status === "P").length} Present ·{" "}
                  {manualDays.filter(d => d.status === "WO").length} Week Off ·{" "}
                  {manualDays.filter(d => d.status === "A").length} Absent
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowManual(false)}
                    className="px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={manualSaving || nonBioEmps.length === 0 || !manualEmpId}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50">
                    {manualSaving ? "Saving…" : `Save ${manualDays.length} Records`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
