import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRuns, createRun } from "../../services/payrollRunService";

const MODULES = [
  { value: "probation_office",      label: "Probation – Office" },
  { value: "probation_worker",      label: "Probation – Worker" },
  { value: "permanent_office",      label: "Permanent – Office" },
  { value: "permanent_worker",      label: "Permanent – Worker" },
  { value: "contract_office",       label: "Contract – Office" },
  { value: "contract_worker",       label: "Contract – Worker" },
  { value: "consultant_office",     label: "Consultant – Office" },
  { value: "consultant_worker",     label: "Consultant – Worker" },
  { value: "consultant_housekeeping", label: "Consultant – Housekeeping" },
  { value: "consultant_security",   label: "Consultant – Security" },
  { value: "cash_office",           label: "Cash – Office" },
  { value: "cash_worker",           label: "Cash – Worker" },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const STATUS_STYLE = {
  draft:      "bg-slate-100 text-slate-600",
  processing: "bg-amber-100 text-amber-700",
  approved:   "bg-emerald-100 text-emerald-700",
  locked:     "bg-indigo-100 text-indigo-700",
};

function Badge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

const Icon = ({ d }) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const now = new Date();
const EMPTY_FORM = {
  period_year:   now.getFullYear(),
  period_month:  now.getMonth() + 1,
  payroll_module: "permanent_office",
  total_days:    30,
  working_days:  26,
};

export default function PayrollRunsPage() {
  const [runs, setRuns]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // filter state
  const [filterYear, setFilterYear]   = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  function load() {
    setLoading(true);
    const params = {};
    if (filterYear)  params.year  = filterYear;
    if (filterMonth) params.month = filterMonth;
    listRuns(params)
      .then(setRuns)
      .catch(() => setError("Failed to load runs"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filterYear, filterMonth]); // eslint-disable-line

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true); setCreateError("");
    try {
      await createRun({
        ...form,
        period_year:  Number(form.period_year),
        period_month: Number(form.period_month),
        total_days:   Number(form.total_days),
        working_days: Number(form.working_days),
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setCreateError(err.response?.data?.detail || "Failed to create run");
    } finally {
      setCreating(false);
    }
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payroll Runs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create and manage monthly payroll runs by module.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setCreateError(""); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Icon d="M12 4v16m8-8H4" />
          New Run
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">All years</option>
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">All months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      {/* ── Table ── */}
      {error && <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-400 mb-3">No payroll runs found.</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm text-indigo-600 font-medium hover:underline"
            >
              Create the first run
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Module</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Days</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {MONTHS[run.period_month - 1]} {run.period_year}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">
                    {MODULES.find((m) => m.value === run.payroll_module)?.label ?? run.payroll_module}
                  </td>
                  <td className="px-5 py-3.5 text-center text-gray-600">
                    {run.working_days} / {run.total_days}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge status={run.status} />
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">
                    {new Date(run.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/payroll/runs/${run.id}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">New Payroll Run</h2>
              <p className="text-xs text-gray-400 mt-0.5">One run per module per month.</p>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {createError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{createError}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                  <input
                    type="number"
                    min="2020" max="2100"
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    {...field("period_year")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
                  <select
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    {...field("period_month")}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payroll Module</label>
                <select
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  {...field("payroll_module")}
                >
                  {MODULES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Total Days</label>
                  <input
                    type="number"
                    min="1" max="31"
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    {...field("total_days")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Working Days</label>
                  <input
                    type="number"
                    min="1" max="31"
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    {...field("working_days")}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? "Creating…" : "Create Run"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
