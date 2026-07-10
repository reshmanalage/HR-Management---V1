import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRun, getRunSummary, computeRun, approveAll, lockRun, unlockRun,
  deleteRun, listEntries, approveEntry, holdEntry, releaseEntry, markPaid,
  loadAttendanceFromReport, upsertAttendance, upsertManualInputs,
} from "../../services/payrollRunService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const MODULE_LABELS = {
  probation_office:       "Probation – Office",
  probation_worker:       "Probation – Worker",
  permanent_office:       "Permanent – Office",
  permanent_worker:       "Permanent – Worker",
  contract_office:        "Contract – Office",
  contract_worker:        "Contract – Worker",
  consultant_office:      "Consultant – Office",
  consultant_worker:      "Consultant – Worker",
  consultant_housekeeping:"Consultant – Housekeeping",
  consultant_security:    "Consultant – Security",
  cash_office:            "Cash – Office",
  cash_worker:            "Cash – Worker",
};

const STATUS_STYLE = {
  draft:      "bg-slate-100 text-slate-600",
  processing: "bg-amber-100 text-amber-700",
  approved:   "bg-emerald-100 text-emerald-700",
  locked:     "bg-indigo-100 text-indigo-700",
};

const ENTRY_STATUS_STYLE = {
  pending:  "bg-slate-100 text-slate-600",
  approved: "bg-emerald-100 text-emerald-700",
  on_hold:  "bg-red-100 text-red-600",
  paid:     "bg-blue-100 text-blue-700",
};

const Icon = ({ d, className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const fmt = (n) => Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fmtCur = (n) => `₹${fmt(n)}`;

function Badge({ status, map }) {
  const cls = map[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>
      {status?.replace("_", " ")}
    </span>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary }) {
  if (!summary) return null;
  const cards = [
    { label: "Employees",     value: summary.employee_count, isCur: false },
    { label: "Total Gross",   value: summary.total_actual_gross, isCur: true },
    { label: "OT Amount",     value: summary.total_ot_amount, isCur: true },
    { label: "Total Earnings",value: summary.total_earnings, isCur: true },
    { label: "PF (EE)",       value: summary.total_pf, isCur: true },
    { label: "ESIC (EE)",     value: summary.total_ee_esic, isCur: true },
    { label: "PT",            value: summary.total_pt, isCur: true },
    { label: "Net Pay",       value: summary.total_net_pay, isCur: true },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map(({ label, value, isCur }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 mt-1 font-mono">
            {isCur ? fmtCur(value) : value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Attendance Tab ─────────────────────────────────────────────────────────────

function AttendanceTab({ run, entries, onRefresh }) {
  const [rows, setRows]         = useState({});
  const [saving, setSaving]     = useState({});
  const [saved, setSaved]       = useState({});
  const [loading, setLoading]   = useState(false);
  const [loadMsg, setLoadMsg]   = useState("");
  const isLocked = run?.status === "locked";

  useEffect(() => {
    const init = {};
    entries.forEach((e) => {
      init[e.employee_id] = {
        lop_days:   e.lop_days  ?? 0,
        ot_hours:   e.ot_hours  ?? 0,
        duty_hours: e.duty_hours ?? 8.5,
      };
    });
    setRows(init);
  }, [entries]);

  async function handleLoadFromReport() {
    setLoading(true);
    setLoadMsg("");
    try {
      const res = await loadAttendanceFromReport(run.id);
      setLoadMsg(`Loaded attendance for ${res.loaded} employees (cycle ${res.cycle_start} → ${res.cycle_end})`);
      await onRefresh();
    } catch (err) {
      setLoadMsg(err.response?.data?.detail || "Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  }

  async function save(empId) {
    setSaving((s) => ({ ...s, [empId]: true }));
    try {
      await upsertAttendance(run.id, empId, rows[empId]);
      setSaved((s) => ({ ...s, [empId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [empId]: false })), 1500);
    } catch {
      // silently fail — user will retry
    } finally {
      setSaving((s) => ({ ...s, [empId]: false }));
    }
  }

  const update = (empId, key, val) =>
    setRows((r) => ({ ...r, [empId]: { ...r[empId], [key]: val } }));

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
        No entries yet — compute the run first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!isLocked && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleLoadFromReport}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 disabled:opacity-50 border border-indigo-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? "Loading…" : "Load from Attendance Report"}
          </button>
          {loadMsg && (
            <span className={`text-xs ${loadMsg.includes("Failed") ? "text-red-500" : "text-emerald-600"}`}>
              {loadMsg}
            </span>
          )}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LOP Days</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">OT Hours</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duty Hrs/day</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => {
              const row = rows[e.employee_id] ?? { lop_days: 0, ot_hours: 0, duty_hours: 8.5 };
              return (
                <tr key={e.employee_id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-gray-900 leading-tight text-sm">{e.employee_name ?? `Employee #${e.employee_id}`}</p>
                    {e.employee_code && <p className="text-[10px] text-gray-400 font-mono mt-0.5">#{e.employee_code}</p>}
                  </td>
                  {["lop_days","ot_hours","duty_hours"].map((key) => (
                    <td key={key} className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        disabled={isLocked}
                        value={row[key]}
                        onChange={(ev) => update(e.employee_id, key, ev.target.value)}
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    {!isLocked && (
                      <button
                        onClick={() => save(e.employee_id)}
                        disabled={saving[e.employee_id]}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                      >
                        {saved[e.employee_id] ? "Saved ✓" : saving[e.employee_id] ? "…" : "Save"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Manual Inputs Tab ──────────────────────────────────────────────────────────

const MANUAL_FIELDS = [
  { key: "reimbursement",     label: "Reimbursement" },
  { key: "incentive",         label: "Incentive" },
  { key: "bonus",             label: "Bonus" },
  { key: "advance",           label: "Advance" },
  { key: "other_deduction",   label: "Other Deduction" },
  { key: "extra_deduction_1", label: "Extra Ded. 1" },
  { key: "extra_deduction_2", label: "Extra Ded. 2" },
];

function ManualInputsTab({ run, entries, onRefresh }) {
  const [rows, setRows]     = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved]   = useState({});
  const isLocked = run?.status === "locked";

  useEffect(() => {
    const init = {};
    entries.forEach((e) => {
      init[e.employee_id] = {
        reimbursement: e.reimbursement ?? 0,
        incentive:     e.incentive     ?? 0,
        bonus:         e.bonus         ?? 0,
        advance:       e.advance       ?? 0,
        other_deduction:   e.other_deduction   ?? 0,
        extra_deduction_1: e.extra_deduction_1 ?? 0,
        extra_deduction_2: e.extra_deduction_2 ?? 0,
      };
    });
    setRows(init);
  }, [entries]);

  async function save(empId) {
    setSaving((s) => ({ ...s, [empId]: true }));
    try {
      await upsertManualInputs(run.id, empId, rows[empId]);
      setSaved((s) => ({ ...s, [empId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [empId]: false })), 1500);
    } catch {
      // silently fail
    } finally {
      setSaving((s) => ({ ...s, [empId]: false }));
    }
  }

  const update = (empId, key, val) =>
    setRows((r) => ({ ...r, [empId]: { ...r[empId], [key]: val } }));

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
        No entries yet — compute the run first.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="text-sm min-w-[900px] w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50">Employee</th>
            {MANUAL_FIELDS.map(({ key, label }) => (
              <th key={key} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</th>
            ))}
            <th className="px-4 py-3 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((e) => {
            const row = rows[e.employee_id] ?? {};
            return (
              <tr key={e.employee_id} className="hover:bg-gray-50/50">
                <td className="px-5 py-2 sticky left-0 bg-white">
                  <p className="font-medium text-gray-900 text-sm leading-tight">{e.employee_name ?? `Employee #${e.employee_id}`}</p>
                  {e.employee_code && <p className="text-[10px] text-gray-400 font-mono mt-0.5">#{e.employee_code}</p>}
                </td>
                {MANUAL_FIELDS.map(({ key }) => (
                  <td key={key} className="px-3 py-2 text-center">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isLocked}
                      value={row[key] ?? 0}
                      onChange={(ev) => update(e.employee_id, key, ev.target.value)}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  {!isLocked && (
                    <button
                      onClick={() => save(e.employee_id)}
                      disabled={saving[e.employee_id]}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                    >
                      {saved[e.employee_id] ? "Saved ✓" : saving[e.employee_id] ? "…" : "Save"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Hold Modal ─────────────────────────────────────────────────────────────────

function HoldModal({ entryId, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onConfirm(entryId, reason);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Hold reason</h3>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this entry is on hold…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-red-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Put On Hold"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Unlock Modal ──────────────────────────────────────────────────────────────

function UnlockModal({ runId, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onConfirm(runId, reason);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Unlock run</h3>
        <p className="text-xs text-gray-400 mb-3">Provide a reason for unlocking this locked payroll run.</p>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            required
            minLength={5}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for unlock…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteRunModal({ run, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onConfirm();
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Delete payroll run?</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {MONTHS[(run?.period_month ?? 1) - 1]} {run?.period_year} — {MODULE_LABELS[run?.payroll_module] ?? run?.payroll_module}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          This will permanently delete the run along with all its salary entries, attendance inputs, and manual inputs. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete Run"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Entry Detail Panel ────────────────────────────────────────────────────────

function EntryDetailPanel({ e }) {
  const earningRows = [
    { label: "Basic",            val: e.actual_basic,    always: true },
    { label: "HRA",              val: e.actual_hra,      always: false },
    { label: "Other Allowances", val: e.actual_others,   always: false },
    { label: "Overtime",         val: e.ot_amount,       always: false },
    { label: "Reimbursement",    val: e.reimbursement,   always: false },
    { label: "Incentive",        val: e.incentive,       always: false },
    { label: "Bonus",            val: e.bonus,           always: false },
  ].filter(r => r.always || r.val > 0);

  const deductionRows = [
    { label: "PF (Employee 12%)",    val: e.actual_pf,          always: false },
    { label: "ESIC (Employee 0.75%)",val: e.ee_esic,            always: false },
    { label: "Professional Tax",     val: e.pt,                 always: false },
    { label: "Contract Deduction",   val: e.contract_deduction, always: false },
    { label: "Advance",              val: e.advance,            always: false },
    { label: "Other Deduction",      val: e.other_deduction,    always: false },
    { label: "Extra Deduction 1",    val: e.extra_deduction_1,  always: false },
    { label: "Extra Deduction 2",    val: e.extra_deduction_2,  always: false },
  ].filter(r => r.val > 0);

  const employerRows = [
    { label: "Employer PF",   val: e.employer_pf },
    { label: "Employer ESIC", val: e.er_esic },
  ].filter(r => r.val > 0);

  return (
    <div className="px-6 py-5 bg-slate-50 border-t border-gray-100">
      {/* Salary flow strip */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5 text-xs">
        {[
          { label: "Monthly CTC",  val: fmtCur(e.monthly_ctc),   color: "bg-gray-100 text-gray-700" },
          { label: "Gross",        val: fmtCur(e.gross),          color: "bg-gray-100 text-gray-700" },
          ...(e.lop_days > 0 ? [{ label: `LOP ${e.lop_days}d`, val: `−${fmtCur(e.lop_amount)}`, color: "bg-red-50 text-red-600 border border-red-100" }] : []),
          { label: "Actual Gross", val: fmtCur(e.actual_gross),   color: "bg-indigo-50 text-indigo-700 border border-indigo-100" },
          ...(e.ot_amount > 0 ? [{ label: `OT ${e.ot_hours}h`, val: `+${fmtCur(e.ot_amount)}`, color: "bg-emerald-50 text-emerald-700 border border-emerald-100" }] : []),
          { label: "Total Earnings", val: fmtCur(e.total_earnings), color: "bg-blue-50 text-blue-700 border border-blue-100" },
          { label: "Deductions",   val: `−${fmtCur(e.total_deductions)}`, color: "bg-red-50 text-red-600 border border-red-100" },
          { label: "Net Pay",      val: fmtCur(e.net_pay),        color: "bg-emerald-600 text-white font-bold" },
        ].map((step, i, arr) => (
          <span key={step.label} className="flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-lg font-medium ${step.color}`}>
              <span className="opacity-60 mr-1">{step.label}</span>{step.val}
            </span>
            {i < arr.length - 1 && <span className="text-gray-300">→</span>}
          </span>
        ))}
      </div>

      {/* Three-column breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Earnings */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Earnings</p>
          </div>
          <div className="divide-y divide-gray-50">
            {earningRows.map(r => (
              <div key={r.label} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-gray-500">{r.label}</span>
                <span className="font-mono text-gray-800">{fmtCur(r.val)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5 bg-gray-50 text-sm font-semibold">
              <span className="text-gray-700">Total Earnings</span>
              <span className="font-mono text-gray-900">{fmtCur(e.total_earnings)}</span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Deductions</p>
          </div>
          <div className="divide-y divide-gray-50">
            {deductionRows.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-300">No deductions</p>
            ) : deductionRows.map(r => (
              <div key={r.label} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-gray-500">{r.label}</span>
                <span className="font-mono text-red-500">{fmtCur(r.val)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5 bg-gray-50 text-sm font-semibold">
              <span className="text-gray-700">Total Deductions</span>
              <span className="font-mono text-red-600">{fmtCur(e.total_deductions)}</span>
            </div>
          </div>
        </div>

        {/* Net Pay + Employer */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net Pay</p>
            </div>
            <div className="px-4 py-4 text-center">
              <p className="text-2xl font-bold text-gray-900 font-mono">{fmtCur(e.net_pay)}</p>
              <p className="text-[10px] text-gray-400 mt-1">
                {fmtCur(e.total_earnings)} − {fmtCur(e.total_deductions)}
              </p>
            </div>
          </div>
          {employerRows.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Employer Contributions</p>
              </div>
              <div className="divide-y divide-gray-50">
                {employerRows.map(r => (
                  <div key={r.label} className="flex justify-between px-4 py-2 text-sm">
                    <span className="text-gray-500">{r.label}</span>
                    <span className="font-mono text-gray-600">{fmtCur(r.val)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2 text-xs text-gray-400">
                  <span>Total CTC (month)</span>
                  <span className="font-mono">{fmtCur(e.net_pay + e.total_deductions + employerRows.reduce((s, r) => s + r.val, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entries Tab ───────────────────────────────────────────────────────────────

function EntriesTab({ run, entries, onAction }) {
  const [holdTarget, setHoldTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const isLocked = run?.status === "locked";

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  return (
    <>
      {holdTarget && (
        <HoldModal
          entryId={holdTarget}
          onConfirm={async (id, reason) => { await onAction("hold", id, reason); setHoldTarget(null); }}
          onClose={() => setHoldTarget(null)}
        />
      )}

      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
          No entries yet — use <strong>Compute</strong> to generate salary entries for all employees in this module.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="text-sm min-w-[1100px] w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Emp</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gross</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LOP</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Act. Gross</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">OT</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Earnings</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deductions</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-bold">Net Pay</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 min-w-[160px]" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isOpen = expandedId === e.id;
                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => toggleExpand(e.id)}
                      className={`cursor-pointer border-t border-gray-100 transition-colors ${isOpen ? "bg-indigo-50/60" : "hover:bg-gray-50/50"}`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <div>
                            <p className="font-medium text-gray-900 leading-tight">{e.employee_name ?? `Employee #${e.employee_id}`}</p>
                            {e.employee_code && <p className="text-[10px] text-gray-400 font-mono mt-0.5">#{e.employee_code}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{fmtCur(e.gross)}</td>
                      <td className="px-4 py-3 text-right text-red-500 font-mono">{e.lop_days > 0 ? `−${fmtCur(e.lop_amount)}` : "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmtCur(e.actual_gross)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-mono">{e.ot_amount > 0 ? `+${fmtCur(e.ot_amount)}` : "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmtCur(e.total_earnings)}</td>
                      <td className="px-4 py-3 text-right text-red-500 font-mono">{fmtCur(e.total_deductions)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 font-mono">{fmtCur(e.net_pay)}</td>
                      <td className="px-4 py-3">
                        <Badge status={e.approval_status} map={ENTRY_STATUS_STYLE} />
                        {e.hold_reason && (
                          <p className="text-[10px] text-red-400 mt-0.5 truncate max-w-[120px]" title={e.hold_reason}>{e.hold_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                        {!isLocked && (
                          <div className="flex items-center gap-2 justify-end">
                            {e.approval_status === "pending" && (
                              <>
                                <button onClick={() => onAction("approve", e.id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-800">Approve</button>
                                <button onClick={() => setHoldTarget(e.id)} className="text-xs font-medium text-red-500 hover:text-red-700">Hold</button>
                              </>
                            )}
                            {e.approval_status === "approved" && (
                              <>
                                <button onClick={() => onAction("mark-paid", e.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Mark Paid</button>
                                <button onClick={() => setHoldTarget(e.id)} className="text-xs font-medium text-red-500 hover:text-red-700">Hold</button>
                              </>
                            )}
                            {e.approval_status === "on_hold" && (
                              <button onClick={() => onAction("release", e.id)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Release</button>
                            )}
                            {e.approval_status === "paid" && (
                              <span className="text-xs text-gray-400">Paid</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${e.id}-detail`}>
                        <td colSpan={10} className="p-0">
                          <EntryDetailPanel e={e} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ["Entries", "Attendance", "Manual Inputs"];

export default function PayrollRunDetailPage() {
  const { runId } = useParams();
  const navigate  = useNavigate();

  const [run, setRun]         = useState(null);
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [tab, setTab]         = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [toast, setToast]     = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([getRun(runId), listEntries(runId)]);
      setRun(r);
      setEntries(e);
      if (e.length > 0) {
        getRunSummary(runId).then(setSummary).catch(() => {});
      }
    } catch {
      setError("Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function runAction(action, args = []) {
    setActionBusy(action);
    try {
      if (action === "compute")     { await computeRun(runId);          showToast("Computed successfully"); }
      if (action === "approve-all") { await approveAll(runId);          showToast("All pending entries approved"); }
      if (action === "lock")        { await lockRun(runId);             showToast("Run locked"); }
      await loadAll();
    } catch (err) {
      showToast(err.response?.data?.detail || `${action} failed`);
    } finally {
      setActionBusy("");
    }
  }

  async function handleUnlock(id, reason) {
    try {
      await unlockRun(id, reason);
      setShowUnlock(false);
      showToast("Run unlocked");
      await loadAll();
    } catch (err) {
      showToast(err.response?.data?.detail || "Unlock failed");
    }
  }

  async function handleDeleteRun() {
    try {
      await deleteRun(runId);
      navigate("/payroll/runs");
    } catch (err) {
      setShowDelete(false);
      showToast(err.response?.data?.detail || "Delete failed");
    }
  }

  async function handleEntryAction(action, entryId, reason) {
    try {
      if (action === "approve")   await approveEntry(entryId);
      if (action === "hold")      await holdEntry(entryId, reason);
      if (action === "release")   await releaseEntry(entryId);
      if (action === "mark-paid") await markPaid(entryId, new Date().toISOString());
      showToast("Updated");
      await loadAll();
    } catch (err) {
      showToast(err.response?.data?.detail || "Action failed");
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-500 py-12 text-center">{error}</div>;
  }

  const isLocked = run?.status === "locked";
  const isDraft  = run?.status === "draft" || run?.status === "processing";

  return (
    <div>
      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {showUnlock && (
        <UnlockModal runId={runId} onConfirm={handleUnlock} onClose={() => setShowUnlock(false)} />
      )}

      {showDelete && (
        <DeleteRunModal run={run} onConfirm={handleDeleteRun} onClose={() => setShowDelete(false)} />
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <button
            onClick={() => navigate("/payroll/runs")}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1 flex items-center gap-1"
          >
            <Icon d="M15 19l-7-7 7-7" className="w-3 h-3" />
            All Runs
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            {MONTHS[(run?.period_month ?? 1) - 1]} {run?.period_year} —{" "}
            {MODULE_LABELS[run?.payroll_module] ?? run?.payroll_module}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLE[run?.status]}`}>
              {run?.status}
            </span>
            <span className="text-xs text-gray-400">{run?.working_days} working / {run?.total_days} total days</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isDraft && (
            <button
              onClick={() => runAction("compute")}
              disabled={!!actionBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Icon d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" className="w-3.5 h-3.5" />
              {actionBusy === "compute" ? "Computing…" : "Compute"}
            </button>
          )}
          {run?.status !== "locked" && entries.length > 0 && (
            <button
              onClick={() => runAction("approve-all")}
              disabled={!!actionBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3.5 h-3.5" />
              {actionBusy === "approve-all" ? "Approving…" : "Approve All"}
            </button>
          )}
          {run?.status === "approved" && (
            <button
              onClick={() => runAction("lock")}
              disabled={!!actionBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="w-3.5 h-3.5" />
              {actionBusy === "lock" ? "Locking…" : "Lock Run"}
            </button>
          )}
          {isLocked && (
            <button
              onClick={() => setShowUnlock(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Icon d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" className="w-3.5 h-3.5" />
              Unlock
            </button>
          )}
          {!isLocked && (
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      <SummaryCards summary={summary} />

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === i
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
            {t === "Entries" && entries.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{entries.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 0 && <EntriesTab run={run} entries={entries} onAction={handleEntryAction} />}
      {tab === 1 && <AttendanceTab run={run} entries={entries} onRefresh={loadAll} />}
      {tab === 2 && <ManualInputsTab run={run} entries={entries} onRefresh={loadAll} />}
    </div>
  );
}
