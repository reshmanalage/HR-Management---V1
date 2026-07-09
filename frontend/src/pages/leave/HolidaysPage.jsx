import { useEffect, useState } from "react";
import { listHolidays, createHoliday, updateHoliday, deleteHoliday } from "../../services/leaveService";

const TYPE_LABELS = { national: "National", optional: "Optional", restricted: "Restricted" };
const TYPE_STYLES = {
  national: "bg-blue-100 text-blue-700",
  optional: "bg-purple-100 text-purple-700",
  restricted: "bg-orange-100 text-orange-700",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const EMPTY = { name: "", holiday_date: "", holiday_type: "national", description: "" };

export default function HolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [year]);

  async function load() {
    try { setHolidays(await listHolidays(year)); } catch {}
  }

  function openNew() { setEditing(null); setForm(EMPTY); setError(""); setShowForm(true); }
  function openEdit(h) {
    setEditing(h);
    setForm({ name: h.name, holiday_date: h.holiday_date, holiday_type: h.holiday_type, description: h.description || "" });
    setError(""); setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (editing) await updateHoliday(editing.id, form);
      else await createHoliday(form);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save holiday");
    } finally { setSaving(false); }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  function isFuture(h) {
    return new Date(h.holiday_date + "T00:00:00") > today;
  }

  async function handleDelete(h) {
    if (!confirm(`Delete "${h.name}"?`)) return;
    try { await deleteHoliday(h.id); await load(); } catch {}
  }

  const grouped = holidays.reduce((acc, h) => {
    const m = new Date(h.holiday_date).getMonth();
    (acc[m] = acc[m] || []).push(h);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-gray-800">Holidays</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} className="p-1 hover:bg-gray-200 rounded">‹</button>
            <span className="text-sm font-medium w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1 hover:bg-gray-200 rounded">›</button>
          </div>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          + Add Holiday
        </button>
      </div>

      {holidays.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">No holidays for {year}</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a - b).map(([m, items]) => (
            <div key={m} className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {MONTHS[m]}
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {items.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 w-28 text-gray-500">
                        {new Date(h.holiday_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{h.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[h.holiday_type]}`}>
                          {TYPE_LABELS[h.holiday_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{h.description}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => openEdit(h)} className="text-indigo-600 hover:underline text-xs">Edit</button>
                        {isFuture(h) && (
                          <button onClick={() => handleDelete(h)} className="text-red-500 hover:underline text-xs">Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Holiday" : "Add Holiday"}</h2>
            {error && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Holiday Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Republic Day" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                  <input required type="date" value={form.holiday_date}
                    onChange={(e) => setForm({ ...form, holiday_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={form.holiday_type} onChange={(e) => setForm({ ...form, holiday_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="national">National</option>
                    <option value="optional">Optional</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
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
