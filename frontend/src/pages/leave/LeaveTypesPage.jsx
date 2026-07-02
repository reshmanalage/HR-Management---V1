import { useEffect, useState } from "react";
import { listLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType } from "../../services/leaveService";

const EMPTY = {
  name: "", code: "", description: "", days_allowed: 0,
  is_paid: true, carry_forward: false, max_carry_forward_days: "",
  is_earned: false, accrual_threshold_days: "", accrual_per_month: "",
};

export default function LeaveTypesPage() {
  const [types, setTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setTypes(await listLeaveTypes()); } catch {}
  }

  function openNew() { setEditing(null); setForm(EMPTY); setError(""); setShowForm(true); }
  function openEdit(t) {
    setEditing(t);
    setForm({
      name: t.name, code: t.code, description: t.description || "",
      days_allowed: t.days_allowed, is_paid: t.is_paid, carry_forward: t.carry_forward,
      max_carry_forward_days: t.max_carry_forward_days ?? "",
      is_earned: t.is_earned,
      accrual_threshold_days: t.accrual_threshold_days ?? "",
      accrual_per_month: t.accrual_per_month ?? "",
    });
    setError(""); setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        days_allowed: parseFloat(form.days_allowed) || 0,
        max_carry_forward_days: form.max_carry_forward_days !== "" ? parseFloat(form.max_carry_forward_days) : null,
        accrual_threshold_days: form.accrual_threshold_days !== "" ? parseInt(form.accrual_threshold_days) : null,
        accrual_per_month: form.accrual_per_month !== "" ? parseFloat(form.accrual_per_month) : null,
      };
      if (editing) await updateLeaveType(editing.id, payload);
      else await createLeaveType(payload);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save leave type");
    } finally { setSaving(false); }
  }

  async function handleDelete(t) {
    if (!confirm(`Delete "${t.name}"?`)) return;
    try { await deleteLeaveType(t.id); await load(); } catch (err) {
      alert(err.response?.data?.detail || "Cannot delete — it may be in use");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Leave Types</h1>
        <button onClick={openNew} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          + Add Leave Type
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Days</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Carry Forward</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {types.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {t.name}
                  {t.is_earned && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Earned</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono">{t.code}</td>
                <td className="px-4 py-3 text-gray-700">
                  {t.is_earned ? (
                    <span className="text-xs text-gray-500">
                      {t.accrual_per_month}/mo (≥{t.accrual_threshold_days} days)
                    </span>
                  ) : t.days_allowed}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.is_paid ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {t.is_paid ? "Paid" : "Unpaid"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {t.carry_forward ? `Yes (max ${t.max_carry_forward_days ?? "∞"})` : "No"}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(t)} className="text-indigo-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(t)} className="text-red-500 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {types.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No leave types yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-screen overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Leave Type" : "New Leave Type"}</h2>
            {error && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
                  <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} />
                  Paid Leave
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_earned} onChange={(e) => setForm({ ...form, is_earned: e.target.checked })} />
                  Earned (PL)
                </label>
              </div>

              {!form.is_earned && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Days Allowed per Year</label>
                  <input type="number" step="0.5" min="0" value={form.days_allowed}
                    onChange={(e) => setForm({ ...form, days_allowed: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}

              {form.is_earned && (
                <div className="grid grid-cols-2 gap-4 p-3 bg-amber-50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min days present/month</label>
                    <input type="number" value={form.accrual_threshold_days}
                      onChange={(e) => setForm({ ...form, accrual_threshold_days: e.target.value })}
                      placeholder="21" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">PL earned per month</label>
                    <input type="number" step="0.25" value={form.accrual_per_month}
                      onChange={(e) => setForm({ ...form, accrual_per_month: e.target.value })}
                      placeholder="1" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="checkbox" id="cf" checked={form.carry_forward}
                  onChange={(e) => setForm({ ...form, carry_forward: e.target.checked })} />
                <label htmlFor="cf" className="text-sm cursor-pointer">Allow carry forward</label>
              </div>
              {form.carry_forward && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max carry forward days (blank = unlimited)</label>
                  <input type="number" step="0.5" value={form.max_carry_forward_days}
                    onChange={(e) => setForm({ ...form, max_carry_forward_days: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}

              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.is_active ?? true}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <label htmlFor="active" className="text-sm cursor-pointer">Active</label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
