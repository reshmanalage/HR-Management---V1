import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  calculateLOP,
  getAttendanceReport,
  overrideDeduction,
  revertDeductionOverride,
} from "../../services/payrollService";

// Returns the most recent cycle start (21st of current or previous month)
function currentCycleStart() {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-indexed
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

// alias kept for OT display
const formatOT = formatMins;

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m > 0 ? m + "m" : ""}`.trim();
}

const STATUS_STYLES = {
  P:  { label: "Present",  cls: "bg-green-100 text-green-800"   },
  A:  { label: "Absent",   cls: "bg-red-100 text-red-800"       },
  WO: { label: "WO (Sun)", cls: "bg-gray-100 text-gray-600"     },
  H:  { label: "Holiday",  cls: "bg-blue-100 text-blue-800"     },
  LV: { label: "Leave",    cls: "bg-purple-100 text-purple-800" },
};

const DED_TYPE_LABELS = {
  late_arrival:   "Late Arrival",
  early_leaving:  "Early Leaving",
  grace_exceeded: "Grace Exceeded",
  absence:        "Absent",
  leave_lop:      "Leave LOP",
  leave_double:   "Penalty 2×",
};

function StatusBadge({ status }) {
  const meta = STATUS_STYLES[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function SummaryBadge({ label, value, color = "gray" }) {
  const colors = {
    gray:   "bg-gray-100 text-gray-700",
    green:  "bg-green-100 text-green-700",
    red:    "bg-red-100 text-red-700",
    blue:   "bg-blue-100 text-blue-700",
    indigo: "bg-indigo-100 text-indigo-700",
    amber:  "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 ${colors[color]}`}>
      <span className="text-base font-bold leading-none">{value}</span>
      <span className="text-xs mt-0.5 leading-none opacity-75">{label}</span>
    </div>
  );
}

// ── Inline deduction override editor ────────────────────────────────────────

const DEDUCTION_MODES = [
  { value: "actual_hours", label: "Actual Hours" },
  { value: "penalty",      label: "Penalty Tier" },
  { value: "custom",       label: "Custom"        },
];

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
    return days; // keep current custom value
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
    setReason("");
    setErr("");
    setEditing(true);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 min-w-[230px] bg-white border border-indigo-200 rounded-lg p-2 shadow-sm z-10">
        {/* Mode selector */}
        <div className="flex gap-1">
          {DEDUCTION_MODES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleModeChange(opt.value)}
              className={`flex-1 text-xs px-2 py-1 rounded border transition-colors ${
                mode === opt.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Hint rows */}
        <div className="flex gap-3 text-xs text-gray-500">
          <span>
            Actual: <strong className="text-gray-700">
              {day.deduction_actual_hours > 0 ? `${day.deduction_actual_hours.toFixed(3)}d` : "—"}
            </strong>
          </span>
          <span>
            Penalty: <strong className="text-gray-700">
              {day.deduction_penalty > 0 ? `${day.deduction_penalty.toFixed(3)}d` : "—"}
            </strong>
          </span>
        </div>

        {/* Amount */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.001"
            min="0"
            max="3"
            value={days}
            onChange={(e) => { setMode("custom"); setDays(e.target.value); }}
            className="w-20 border rounded px-2 py-1 text-xs"
          />
          <span className="text-xs text-gray-400">days deducted</span>
        </div>

        {/* Reason */}
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border rounded px-2 py-1 text-xs"
          placeholder="Reason (required)"
        />
        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {saving ? "…" : "Apply"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-gray-500 px-3 py-1 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group">
      {day.deduction_days > 0 ? (
        <span className={`font-semibold ${day.has_manual_override ? "text-purple-700" : "text-red-600"}`}>
          {day.deduction_days.toFixed(2)}d
          {day.has_manual_override && (
            <span className="ml-1 text-xs font-normal bg-purple-100 text-purple-700 px-1 rounded">manual</span>
          )}
        </span>
      ) : (
        <span className="text-gray-300">—</span>
      )}
      {canEdit && (day.status === "P" || day.deduction_days > 0) && (
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={openEditor}
            title="Override deduction"
            className="text-gray-400 hover:text-indigo-600 p-0.5 rounded"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {day.has_manual_override && (
            <button
              onClick={handleRevert}
              disabled={saving}
              title="Revert to system calculation"
              className="text-gray-400 hover:text-orange-500 p-0.5 rounded"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeRow({ emp, cycleStart, canEdit, onRefresh }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm">
            {emp.employee_name}
            {emp.employee_code && (
              <span className="ml-1.5 text-xs text-gray-400 font-mono">#{emp.employee_code}</span>
            )}
          </div>
          {emp.shift_info && (
            <div className="text-xs text-gray-400 mt-0.5">{emp.shift_info}</div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <SummaryBadge label="Present"  value={emp.total_present}    color="green"  />
          <SummaryBadge label="Absent"   value={emp.total_absent}     color="red"    />
          <SummaryBadge label="Leave"    value={emp.total_leave}      color="purple" />
          <SummaryBadge label="WO"       value={emp.total_wo}         color="gray"   />
          <SummaryBadge label="Holiday"  value={emp.total_holidays}   color="blue"   />
          {emp.total_ot_hours > 0 && (
            <SummaryBadge label="OT Hrs"   value={emp.total_ot_hours.toFixed(1)} color="indigo" />
          )}
          {emp.total_deduction_days > 0 && (
            <SummaryBadge label="Ded Days" value={emp.total_deduction_days.toFixed(2)} color="amber" />
          )}
        </div>

        <span className="text-gray-400 text-xs ml-2 shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded day grid */}
      {open && (
        <div className="overflow-x-auto border-t border-gray-100 bg-gray-50">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-500">
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Day</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">In Time</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Out Time</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Duration</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Late By</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Early By</th>
                <th className="px-3 py-2 text-left font-semibold">OT</th>
                <th className="px-3 py-2 text-left font-semibold">Deduction</th>
                <th className="px-3 py-2 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {emp.days.map((day) => {
                const rowCls =
                  day.is_holiday
                    ? "bg-blue-50/60"
                    : day.status === "WO"
                    ? "bg-gray-50"
                    : day.status === "A"
                    ? "bg-red-50/40"
                    : day.status === "LV"
                    ? "bg-purple-50/40"
                    : "";

                return (
                  <tr key={day.date} className={rowCls}>
                    <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{day.date}</td>
                    <td className="px-3 py-2 text-gray-500">{day.day_name}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={day.status} />
                      {day.is_holiday && day.holiday_name && (
                        <span className="ml-1.5 text-gray-500 italic">{day.holiday_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">
                      {day.in_time || (day.status === "P" ? <span className="text-red-400">—</span> : "—")}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">
                      {day.out_time || (day.status === "P" ? <span className="text-red-400">—</span> : "—")}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {formatDuration(day.working_minutes) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {day.late_by_minutes > 0 ? (
                        <span className="text-orange-600 font-medium">{formatMins(day.late_by_minutes)}</span>
                      ) : (day.status === "P" ? <span className="text-green-500">—</span> : "—")}
                    </td>
                    <td className="px-3 py-2">
                      {day.early_by_minutes > 0 ? (
                        <span className="text-yellow-600 font-medium">{formatMins(day.early_by_minutes)}</span>
                      ) : (day.status === "P" ? <span className="text-green-500">—</span> : "—")}
                    </td>
                    <td className="px-3 py-2">
                      {day.ot_minutes > 0 ? (
                        <span className={`font-semibold ${day.status === "P" ? "text-indigo-700" : "text-amber-700"}`}>
                          {formatOT(day.ot_minutes)}
                          {day.status !== "P" && <span className="ml-1 text-xs opacity-75">(WO)</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <DeductionCell
                        day={day}
                        empId={emp.employee_id}
                        cycleStart={cycleStart}
                        canEdit={canEdit}
                        onRefresh={onRefresh}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-500 max-w-xs">
                      {day.deduction_reasons.length > 0
                        ? day.deduction_reasons.join("; ")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LOPReportPage() {
  const { user } = useAuth();
  const isSuperAdmin  = user?.roles?.includes("SUPER_ADMIN");
  const hasAdminModule = (user?.modules ?? []).includes("admin");
  const canEdit = isSuperAdmin || hasAdminModule;

  const [cycleStart, setCycleStart]   = useState(currentCycleStart());
  const [report, setReport]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError]             = useState("");

  async function handleLoad() {
    setLoading(true); setError("");
    try {
      const data = await getAttendanceReport(cycleStart);
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report");
    } finally { setLoading(false); }
  }

  async function handleCalculate() {
    setCalculating(true); setError("");
    try {
      await calculateLOP(cycleStart);
      await handleLoad();
    } catch (err) {
      setError(err.response?.data?.detail || "Calculation failed");
    } finally { setCalculating(false); }
  }

  const totalOT = report?.employees.reduce((s, e) => s + e.total_ot_hours, 0) ?? 0;
  const totalDed = report?.employees.reduce((s, e) => s + e.total_deduction_days, 0) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Attendance &amp; LOP Report</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Full attendance register with OT and LOP deductions — cycle 21st → 20th
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Cycle Start (21st of month)
          </label>
          <input
            type="date"
            value={cycleStart}
            onChange={(e) => setCycleStart(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleLoad}
          disabled={loading || calculating}
          className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "View Report"}
        </button>
        {canEdit && (
          <button
            onClick={handleCalculate}
            disabled={calculating || loading}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {calculating ? "Calculating…" : "Recalculate LOP"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded">{error}</div>
      )}

      {report && (
        <>
          {/* Summary bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-5 flex flex-wrap gap-6 text-sm text-gray-600">
            <div>
              Cycle: <strong>{report.cycle_start}</strong> → <strong>{report.cycle_end}</strong>
            </div>
            <div>Employees: <strong>{report.employees.length}</strong></div>
            <div>Total OT: <strong className="text-indigo-700">{totalOT.toFixed(1)} hrs</strong></div>
            <div>Total Deduction: <strong className="text-red-600">{totalDed.toFixed(2)} days</strong></div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            {Object.entries(STATUS_STYLES).map(([k, v]) => (
              <span key={k} className={`px-2 py-0.5 rounded font-medium ${v.cls}`}>{v.label}</span>
            ))}
            <span className="px-2 py-0.5 rounded font-medium bg-indigo-100 text-indigo-700">OT</span>
            <span className="px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-700">Deduction</span>
            <span className="px-2 py-0.5 rounded font-medium bg-purple-100 text-purple-700">Manual Override</span>
          </div>

          {canEdit && (
            <div className="mb-3 flex items-center gap-2 text-xs text-purple-700 bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>
                Hover over any deduction cell to manually override it. Overrides are shown in purple and can be reverted.
                System calculations remain stored for audit.
              </span>
            </div>
          )}

          {report.employees.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
              No attendance data found for this cycle.
            </div>
          ) : (
            <div>
              {report.employees.map((emp) => (
                <EmployeeRow
                  key={emp.employee_id}
                  emp={emp}
                  cycleStart={cycleStart}
                  canEdit={canEdit}
                  onRefresh={handleLoad}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
