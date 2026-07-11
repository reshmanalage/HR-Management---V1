import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRun, getRunSummary, computeRun, approveAll, lockRun, unlockRun,
  deleteRun, listEntries, approveEntry, holdEntry, releaseEntry, markPaid,
  loadAttendanceFromReport, upsertAttendance, upsertManualInputs,
} from "../../services/payrollRunService";
import { getAttendanceReport } from "../../services/payrollService";
import { getEmployee } from "../../services/employeeService";
import { downloadSalarySlip, downloadAttendanceReport } from "../../utils/payrollPdf";

const COMPANY = {
  name:       "DREAMSPAN VENTURES PRIVATE LIMITED",
  address:    "S. No. 37, Plot No 556/1/2, Near Balaji Hotel, Village - Pisoli,",
  address2:   "Taluka - Haweli, District - Pune, Maharashtra - 411060, India.",
  regdAddress:"Dreamspan Ventures Pvt Ltd, S. No. 37, Plot No 556/1/2, Near Balaji Hotel, Village - Pisoli, Taluka - Haweli, District - Pune, Maharashtra - 411060, India.",
  logoUrl:    null,   // set to "/logo.png" (place logo in public/) to embed it in PDFs
};

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


// ── Cycle start from run ──────────────────────────────────────────────────────

function runCycleStart(run) {
  if (!run) return null;
  const m = run.period_month;
  const y = run.period_year;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear  = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-21`;
}

// ── Entry Detail Panel ────────────────────────────────────────────────────────

function EntryDetailPanel({ e, run }) {
  const earningRows = [
    { label: "Basic",            rate: e.basic,   val: e.actual_basic,  always: true  },
    { label: "HRA",              rate: e.hra,     val: e.actual_hra,    always: false },
    { label: "Other Allowances", rate: e.others,  val: e.actual_others, always: false },
    { label: "Overtime",         rate: null,      val: e.ot_amount,     always: false },
    { label: "Reimbursement",    rate: null,      val: e.reimbursement, always: false },
    { label: "Incentive",        rate: null,      val: e.incentive,     always: false },
    { label: "Bonus",            rate: null,      val: e.bonus,         always: false },
  ].filter(r => r.always || Number(r.val) > 0);

  const deductionRows = [
    { label: "Employee PF (12%)",    val: e.actual_pf          },
    { label: "Employee ESIC (0.75%)",val: e.ee_esic            },
    { label: "Professional Tax",     val: e.pt                 },
    { label: "Contract Deduction",   val: e.contract_deduction },
    { label: "Advance",              val: e.advance            },
    { label: "Other Deduction",      val: e.other_deduction    },
    { label: "Extra Deduction 1",    val: e.extra_deduction_1  },
    { label: "Extra Deduction 2",    val: e.extra_deduction_2  },
  ].filter(r => Number(r.val) > 0);

  const employerRows = [
    { label: "Employer PF",   val: e.employer_pf },
    { label: "Employer ESIC", val: e.er_esic     },
  ].filter(r => Number(r.val) > 0);

  const [dlSlip, setDlSlip] = useState(false);
  const [dlAtt,  setDlAtt]  = useState(false);

  async function fetchEmpProfile() {
    try { return await getEmployee(e.employee_id); } catch { return null; }
  }

  async function handleDownloadSlip() {
    setDlSlip(true);
    try {
      const cycleStart = runCycleStart(run);
      const [empRes, attRes] = await Promise.allSettled([
        fetchEmpProfile(),
        cycleStart ? getAttendanceReport(cycleStart) : Promise.resolve(null),
      ]);
      const empProfile = empRes.status === "fulfilled" ? empRes.value : null;
      const attReport  = attRes.status  === "fulfilled" ? attRes.value : null;
      const attData    = attReport?.employees?.find(em => em.employee_id === e.employee_id) ?? null;
      await downloadSalarySlip(e, run, empProfile, COMPANY, attData);
    } finally { setDlSlip(false); }
  }

  async function handleDownloadAtt() {
    setDlAtt(true);
    try {
      const cycleStart = runCycleStart(run);
      const [empProfile, attReport] = await Promise.allSettled([
        fetchEmpProfile(),
        cycleStart ? getAttendanceReport(cycleStart) : Promise.resolve(null),
      ]);
      const emp     = empProfile.status === "fulfilled" ? empProfile.value : null;
      const attData = attReport.status  === "fulfilled"
        ? attReport.value?.employees?.find(em => em.employee_id === e.employee_id) ?? null
        : null;
      await downloadAttendanceReport(e, run, attData, emp, COMPANY);
    } finally { setDlAtt(false); }
  }

  // Compact flow steps
  const flowSteps = [
    { label: "CTC",         val: fmtCur(e.monthly_ctc),   note: null },
    { label: "Gross",       val: fmtCur(e.gross),          note: e.pf > 0 ? `CTC − PF ${fmtCur(e.pf)}` : "No PF" },
    { label: "Per Day",     val: fmtCur(e.per_day_salary), note: `÷ ${run?.total_days ?? "?"} days` },
    ...(Number(e.lop_days) > 0
      ? [{ label: `LOP ${Number(e.lop_days).toFixed(3)}d`, val: `−${fmtCur(e.lop_amount)}`, note: "Per Day × LOP", minus: true }]
      : []),
    { label: "Act. Gross",  val: fmtCur(e.actual_gross),   note: null },
    ...(Number(e.ot_amount) > 0
      ? [{ label: `OT ${e.ot_hours}h`, val: `+${fmtCur(e.ot_amount)}`, note: null, plus: true }]
      : []),
    { label: "Earnings",    val: fmtCur(e.total_earnings),  note: null },
    { label: "Deductions",  val: `−${fmtCur(e.total_deductions)}`, note: null, minus: true },
    { label: "Net Pay",     val: fmtCur(e.net_pay),          note: null, highlight: true },
  ];

  return (
    <div className="border-t border-gray-100 bg-gray-50/60">
      <div className="px-6 py-5 space-y-5">

        {/* ── Payroll Calculation Flow ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">Payroll Calculation Flow</p>
          <div className="flex flex-wrap items-start gap-y-2 gap-x-1">
            {flowSteps.map((step, i, arr) => (
              <span key={step.label} className="flex items-start gap-1">
                <span className={`inline-flex flex-col items-center px-2.5 py-1.5 rounded-md text-xs leading-tight
                  ${step.highlight
                    ? "bg-emerald-600 text-white font-semibold"
                    : step.minus
                    ? "bg-red-50 text-red-600 border border-red-100"
                    : step.plus
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "bg-white text-gray-700 border border-gray-200"
                  }`}>
                  <span className="text-[9px] font-medium opacity-60 leading-none mb-0.5">{step.label}</span>
                  <span className="font-semibold tabular-nums">{step.val}</span>
                  {step.note && <span className="text-[8px] opacity-50 mt-0.5 leading-none">{step.note}</span>}
                </span>
                {i < arr.length - 1 && (
                  <span className="text-gray-300 text-xs mt-2">›</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* ── Earnings · Deductions · Net Pay ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Earnings */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Earnings</p>
              <p className="text-[10px] text-gray-400 font-medium">Rate → Earned</p>
            </div>
            <div className="divide-y divide-gray-50">
              {earningRows.map(r => (
                <div key={r.label} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-gray-500 w-28 shrink-0">{r.label}</span>
                  <div className="flex items-center gap-3 ml-auto">
                    {r.rate != null && (
                      <span className="text-gray-300 tabular-nums text-right w-20">{fmtCur(r.rate)}</span>
                    )}
                    <span className="font-medium text-gray-800 tabular-nums text-right w-20">{fmtCur(r.val)}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 bg-gray-50 text-xs font-semibold">
                <span className="text-gray-600">Total Earnings</span>
                <span className="tabular-nums text-gray-900">{fmtCur(e.total_earnings)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Deductions</p>
            </div>
            <div className="divide-y divide-gray-50">
              {deductionRows.length === 0
                ? <p className="px-4 py-3 text-xs text-gray-300 italic">No deductions applicable</p>
                : deductionRows.map(r => (
                  <div key={r.label} className="flex justify-between px-4 py-2 text-xs">
                    <span className="text-gray-500">{r.label}</span>
                    <span className="tabular-nums text-red-500">{fmtCur(r.val)}</span>
                  </div>
                ))
              }
              <div className="flex justify-between px-4 py-2.5 bg-gray-50 text-xs font-semibold">
                <span className="text-gray-600">Total Deductions</span>
                <span className="tabular-nums text-red-600">{fmtCur(e.total_deductions)}</span>
              </div>
            </div>
          </div>

          {/* Net Pay + Employer */}
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Net Pay</p>
              </div>
              <div className="px-4 py-4 text-center">
                <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-none">{fmtCur(e.net_pay)}</p>
                <p className="text-[10px] text-gray-400 mt-1.5 tabular-nums">
                  {fmtCur(e.total_earnings)} − {fmtCur(e.total_deductions)}
                </p>
              </div>
            </div>
            {employerRows.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Employer Contributions</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {employerRows.map(r => (
                    <div key={r.label} className="flex justify-between px-4 py-2 text-xs">
                      <span className="text-gray-500">{r.label}</span>
                      <span className="tabular-nums text-gray-600">{fmtCur(r.val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-2 text-xs text-gray-400">
                    <span>Total CTC (month)</span>
                    <span className="tabular-nums">{fmtCur(
                      Number(e.net_pay) + Number(e.total_deductions) + employerRows.reduce((s, r) => s + Number(r.val), 0)
                    )}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Downloads ── */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
          <button
            onClick={handleDownloadSlip}
            disabled={dlSlip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            {dlSlip ? "Generating…" : "Salary Slip"}
          </button>
          <button
            onClick={handleDownloadAtt}
            disabled={dlAtt}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {dlAtt ? "Generating…" : "Attendance Report"}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Icon action button with tooltip ──────────────────────────────────────────
function IconBtn({ title, onClick, className = "", d }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`relative group p-1.5 rounded-md transition-colors ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {title}
      </span>
    </button>
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
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-[35%]">Employee</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Gross Salary</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Net Pay</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((e) => {
                const isOpen = expandedId === e.id;
                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => toggleExpand(e.id)}
                      className={`cursor-pointer transition-colors ${isOpen ? "bg-blue-50/40" : "hover:bg-gray-50/60"}`}
                    >
                      {/* Employee */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <svg
                            className={`w-3 h-3 text-gray-300 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 text-sm leading-snug truncate">
                              {e.employee_name ?? `Employee #${e.employee_id}`}
                            </p>
                            {e.employee_code && (
                              <p className="text-[10px] text-gray-400 font-mono mt-0.5">#{e.employee_code}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Gross */}
                      <td className="px-4 py-3.5 text-right">
                        <p className="text-sm tabular-nums text-gray-600">{fmtCur(e.gross)}</p>
                        {Number(e.lop_days) > 0 && (
                          <p className="text-[10px] text-red-400 tabular-nums mt-0.5">
                            LOP −{fmtCur(e.lop_amount)}
                          </p>
                        )}
                      </td>

                      {/* Net Pay */}
                      <td className="px-4 py-3.5 text-right">
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{fmtCur(e.net_pay)}</p>
                        {Number(e.ot_amount) > 0 && (
                          <p className="text-[10px] text-emerald-600 tabular-nums mt-0.5">
                            OT +{fmtCur(e.ot_amount)}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <Badge status={e.approval_status} map={ENTRY_STATUS_STYLE} />
                        {e.hold_reason && (
                          <p className="text-[10px] text-red-400 mt-1 max-w-[140px] truncate" title={e.hold_reason}>
                            {e.hold_reason}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5" onClick={ev => ev.stopPropagation()}>
                        {!isLocked && (
                          <div className="flex items-center gap-1 justify-end">
                            {e.approval_status === "pending" && (
                              <>
                                <IconBtn
                                  title="Approve"
                                  onClick={() => onAction("approve", e.id)}
                                  className="text-emerald-600 hover:bg-emerald-50"
                                  d="M5 13l4 4L19 7"
                                />
                                <IconBtn
                                  title="Put on Hold"
                                  onClick={() => setHoldTarget(e.id)}
                                  className="text-amber-500 hover:bg-amber-50"
                                  d="M10 9v6m4-6v6M9 3h6l1 1H8L9 3zM4 6h16v2H4V6z"
                                />
                              </>
                            )}
                            {e.approval_status === "approved" && (
                              <>
                                <IconBtn
                                  title="Mark as Paid"
                                  onClick={() => onAction("mark-paid", e.id)}
                                  className="text-blue-600 hover:bg-blue-50"
                                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                                <IconBtn
                                  title="Put on Hold"
                                  onClick={() => setHoldTarget(e.id)}
                                  className="text-amber-500 hover:bg-amber-50"
                                  d="M10 9v6m4-6v6M9 3h6l1 1H8L9 3zM4 6h16v2H4V6z"
                                />
                              </>
                            )}
                            {e.approval_status === "on_hold" && (
                              <IconBtn
                                title="Release Hold"
                                onClick={() => onAction("release", e.id)}
                                className="text-indigo-600 hover:bg-indigo-50"
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            )}
                            {e.approval_status === "paid" && (
                              <span className="text-[10px] text-gray-400 px-1">Paid</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${e.id}-detail`}>
                        <td colSpan={5} className="p-0">
                          <EntryDetailPanel e={e} run={run} />
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
