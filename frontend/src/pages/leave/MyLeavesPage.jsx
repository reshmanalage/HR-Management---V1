import { useEffect, useState } from "react";
import {
  getMyBalances, getMyApplications, applyLeave, cancelLeave,
  listLeaveTypes,
} from "../../services/leaveService";
import { listEmployees } from "../../services/employeeService";
import { useAuth } from "../../context/AuthContext";

const STATUS_STYLES = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const HALF_DAY_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
];

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "EXECUTIVE_ASSISTANT"];

export default function MyLeavesPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some((r) => ADMIN_ROLES.includes(r));

  const [balances, setBalances] = useState([]);
  const [applications, setApplications] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showApply, setShowApply] = useState(false);
  const [form, setForm] = useState({ leave_type_id: "", from_date: "", to_date: "", is_half_day: false, half_day_period: "", reason: "", on_behalf_of_employee_id: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => { load(); }, []);

  async function load() {
    const [b, a, lt] = await Promise.all([
      getMyBalances(year).catch(() => []),
      getMyApplications().catch(() => []),
      listLeaveTypes().catch(() => []),
    ]);
    setBalances(b); setApplications(a); setLeaveTypes(lt);
    if (isAdmin) {
      listEmployees().then(setEmployees).catch(() => {});
    }
  }

  async function handleApply(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = {
        leave_type_id: parseInt(form.leave_type_id),
        from_date: form.from_date,
        to_date: form.is_half_day ? form.from_date : form.to_date,
        is_half_day: form.is_half_day,
        half_day_period: form.is_half_day ? form.half_day_period || null : null,
        reason: form.reason || null,
        on_behalf_of_employee_id: form.on_behalf_of_employee_id ? parseInt(form.on_behalf_of_employee_id) : null,
      };
      await applyLeave(payload);
      setShowApply(false);
      setForm({ leave_type_id: "", from_date: "", to_date: "", is_half_day: false, half_day_period: "", reason: "", on_behalf_of_employee_id: "" });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to apply for leave");
    } finally { setSaving(false); }
  }

  async function handleCancel(app) {
    if (!confirm("Cancel this leave application?")) return;
    try { await cancelLeave(app.id, null); await load(); } catch (err) {
      alert(err.response?.data?.detail || "Cannot cancel");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">My Leaves</h1>
        <button onClick={() => { setShowApply(true); setError(""); }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          + Apply Leave
        </button>
      </div>

      {/* Balance cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {balances.map((b) => (
            <div key={b.id} className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500 font-medium uppercase">{b.leave_type_name}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{b.remaining}</p>
              <p className="text-xs text-gray-400 mt-0.5">of {b.allocated + b.carried_forward} available</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${Math.min(100, (b.remaining / (b.allocated + b.carried_forward || 1)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{b.used} used</p>
            </div>
          ))}
        </div>
      )}

      {balances.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-50 rounded-xl text-sm text-yellow-700">
          No leave balance found for {year}. Contact HR to initialise your leave balance.
        </div>
      )}

      {/* Applications table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-medium text-gray-700">My Applications</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Leave Type</th>
              <th className="px-4 py-3 text-left">From</th>
              <th className="px-4 py-3 text-left">To</th>
              <th className="px-4 py-3 text-left">Days</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Applied</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {applications.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {a.leave_type_name}
                  {a.is_half_day && (
                    <span className="ml-1 text-xs text-gray-400">({a.half_day_period || "half"})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{a.from_date}</td>
                <td className="px-4 py-3 text-gray-600">{a.to_date}</td>
                <td className="px-4 py-3 text-gray-700">{a.days}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(a.applied_at).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3 text-right">
                  {(a.status === "pending" || a.status === "approved") && (
                    <button onClick={() => handleCancel(a)} className="text-red-500 hover:underline text-xs">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {applications.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No leave applications yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Apply form modal */}
      {showApply && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Apply for Leave</h2>
            {error && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}
            <form onSubmit={handleApply} className="space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">On Behalf Of (optional)</label>
                  <select value={form.on_behalf_of_employee_id}
                    onChange={(e) => setForm({ ...form, on_behalf_of_employee_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Myself —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {[emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leave Type *</label>
                <select required value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select leave type</option>
                  {leaveTypes.filter(t => t.is_active).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="half" checked={form.is_half_day}
                  onChange={(e) => setForm({ ...form, is_half_day: e.target.checked })} />
                <label htmlFor="half" className="text-sm cursor-pointer">Half day</label>
              </div>

              {form.is_half_day ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                    <input required type="date" value={form.from_date}
                      onChange={(e) => setForm({ ...form, from_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Session</label>
                    <select value={form.half_day_period} onChange={(e) => setForm({ ...form, half_day_period: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— select —</option>
                      {HALF_DAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">From *</label>
                    <input required type="date" value={form.from_date}
                      onChange={(e) => setForm({ ...form, from_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">To *</label>
                    <input required type="date" value={form.to_date} min={form.from_date}
                      onChange={(e) => setForm({ ...form, to_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowApply(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
