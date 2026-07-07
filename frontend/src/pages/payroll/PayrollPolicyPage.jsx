import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getPayrollPolicy, updatePayrollPolicy } from "../../services/payrollService";

const FIELD_META = [
  { key: "shift_start",                   label: "Default Shift Start",                note: "HH:MM (24-hour) — used when employee has no assigned shift" },
  { key: "shift_end",                     label: "Default Shift End",                  note: "HH:MM (24-hour)" },
  { key: "grace_period_minutes",          label: "Grace Period (minutes)",             note: "Late-arrival window after shift start — no deduction within this window" },
  { key: "max_grace_per_cycle",           label: "Max Grace Uses per Cycle",           note: "Exceeding this triggers a 0.5-day deduction per extra use" },
  { key: "half_day_late_cutoff",          label: "Half-Day Late Cutoff",               note: "Arrival after this time counts as full/half-day loss (penalty mode)" },
  { key: "half_day_early_cutoff",         label: "Half-Day Early Cutoff",              note: "Departure before this time counts as full/half-day loss (penalty mode)" },
  { key: "min_attendance_for_paid_leave", label: "Min Attendance for Paid Leave",      note: "Minimum working days in cycle to be eligible for paid leave" },
  { key: "emergency_leave_per_month",     label: "Max Emergency Leave / Month",        note: "Applications beyond this limit are rejected at submission" },
];

const TIME_KEYS = ["shift_start", "shift_end", "half_day_late_cutoff", "half_day_early_cutoff"];

const MODE_OPTIONS = [
  {
    value: "penalty",
    label: "Penalty Tiers",
    description:
      "Fixed deduction tiers: 0.5d for late arrival, 1d after half-day cutoff, 2× for unapproved leaves. Regularization applications override the tier.",
  },
  {
    value: "actual_hours",
    label: "Actual Hours",
    description:
      "Deduction = minutes missed ÷ shift duration (proportional). No fixed tiers. Applications in the system always take priority; use this mode when Google Form submissions haven't been imported yet.",
  },
];

export default function PayrollPolicyPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.roles?.includes("SUPER_ADMIN");
  const hasAdminModule = (user?.modules ?? []).includes("admin");
  const canEdit = isSuperAdmin || hasAdminModule;

  const [form, setForm]       = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getPayrollPolicy()
      .then((p) => setForm(p))
      .catch(() => setError("Failed to load policy"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = { deduction_mode: form.deduction_mode };
      FIELD_META.forEach(({ key }) => {
        const v = form[key];
        payload[key] = TIME_KEYS.includes(key) ? v : Number(v);
      });
      const updated = await updatePayrollPolicy(payload);
      setForm(updated);
      setSuccess("Policy saved successfully.");
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-1">Payroll Policy</h2>
      <p className="text-sm text-gray-500 mb-6">
        Attendance thresholds and LOP rules applied during payroll calculation.
      </p>

      {error   && <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}
      {success && <div className="mb-4 text-sm text-green-700 bg-green-50 px-3 py-2 rounded">{success}</div>}

      <form onSubmit={handleSave} className="space-y-5">

        {/* ── Deduction Mode ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
          <p className="text-sm font-semibold text-gray-800 mb-1">LOP Deduction Mode</p>
          <p className="text-xs text-gray-400 mb-4">
            Controls how late arrival and early leaving are calculated.{" "}
            <strong>Applications filed in the system always take priority</strong> regardless of mode.
          </p>

          <div className="flex flex-col gap-3">
            {MODE_OPTIONS.map((opt) => {
              const active = form.deduction_mode === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${
                    active
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  } ${!canEdit ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <input
                    type="radio"
                    name="deduction_mode"
                    value={opt.value}
                    checked={active}
                    disabled={!canEdit}
                    onChange={() => setForm((f) => ({ ...f, deduction_mode: opt.value }))}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {form.deduction_mode === "actual_hours" && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
              <strong>Transition mode active.</strong> Deductions are calculated proportionally
              from actual minutes missed. Switch back to Penalty Tiers once all Google Form
              applications have been imported into the system.
            </div>
          )}
        </div>

        {/* ── Numeric / Time fields ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          {FIELD_META.map(({ key, label, note }) => (
            <div key={key} className="px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
              </div>
              <input
                type={TIME_KEYS.includes(key) ? "text" : "number"}
                value={form[key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!canEdit}
                placeholder={TIME_KEYS.includes(key) ? "HH:MM" : "0"}
                className="w-28 border rounded-lg px-3 py-1.5 text-sm text-right disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          ))}
        </div>

        {/* ── Payroll cycle info ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-blue-800 mb-2">Payroll Cycle</p>
          <p className="text-sm text-blue-700">
            Each cycle runs from the <strong>21st</strong> of the current month to the{" "}
            <strong>20th</strong> of the following month. Sunday is the weekly off day.
          </p>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Policy"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
