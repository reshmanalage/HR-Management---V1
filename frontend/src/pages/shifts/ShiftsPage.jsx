import { useEffect, useState } from "react";
import { listShifts, createShift, updateShift, deleteShift } from "../../services/shiftService";

const EMPTY_FORM = {
  name: "",
  start_time: "",
  end_time: "",
  is_flexible: false,
  break_duration_minutes: 60,
  grace_period_minutes: 15,
  description: "",
  is_active: true,
};

function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${((hour % 12) || 12).toString().padStart(2, "0")}:${m} ${ampm}`;
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setShifts(await listShifts());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(shift) {
    setEditing(shift.id);
    setForm({
      name: shift.name,
      start_time: shift.start_time ?? "",
      end_time: shift.end_time ?? "",
      is_flexible: shift.is_flexible,
      break_duration_minutes: shift.break_duration_minutes,
      grace_period_minutes: shift.grace_period_minutes,
      description: shift.description ?? "",
      is_active: shift.is_active,
    });
    setError("");
    setShowForm(true);
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        start_time: form.is_flexible ? null : form.start_time || null,
        end_time: form.is_flexible ? null : form.end_time || null,
        break_duration_minutes: parseInt(form.break_duration_minutes, 10) || 0,
        grace_period_minutes: parseInt(form.grace_period_minutes, 10) || 0,
        description: form.description || null,
      };
      if (editing) {
        await updateShift(editing, payload);
      } else {
        await createShift(payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save shift.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteShift(id);
      setDeleteId(null);
      load();
    } catch {
      setDeleteId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Shift Timings</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage work shifts and schedules</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded hover:bg-gray-700"
        >
          + Add Shift
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : shifts.length === 0 ? (
        <p className="text-sm text-gray-500">No shifts configured yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shifts.map((shift) => (
            <div key={shift.id} className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-800">{shift.name}</h3>
                  {shift.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{shift.description}</p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    shift.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {shift.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Type</p>
                  <p className="text-gray-700 font-medium">
                    {shift.is_flexible ? "Flexible" : "Fixed"}
                  </p>
                </div>
                {!shift.is_flexible && (
                  <>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Start</p>
                      <p className="text-gray-700 font-medium">{formatTime(shift.start_time)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">End</p>
                      <p className="text-gray-700 font-medium">{formatTime(shift.end_time)}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Break</p>
                  <p className="text-gray-700">{shift.break_duration_minutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Grace Period</p>
                  <p className="text-gray-700">{shift.grace_period_minutes} min</p>
                </div>
              </div>

              {!shift.is_flexible && shift.start_time && shift.end_time && (
                <div className="bg-gray-50 rounded px-3 py-2 text-xs text-gray-600">
                  Working hours:{" "}
                  {(() => {
                    const [sh, sm] = shift.start_time.split(":").map(Number);
                    const [eh, em] = shift.end_time.split(":").map(Number);
                    const total = (eh * 60 + em) - (sh * 60 + sm) - shift.break_duration_minutes;
                    return `${Math.floor(total / 60)}h ${total % 60}m`;
                  })()}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => openEdit(shift)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteId(shift.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">
              {editing ? "Edit Shift" : "New Shift"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shift Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="e.g. General Shift"
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="is_flexible"
                  checked={form.is_flexible}
                  onChange={handleChange}
                  className="rounded"
                />
                <span className="font-medium text-gray-700">Flexible / Mixed shift (no fixed time)</span>
              </label>

              {!form.is_flexible && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      name="start_time"
                      value={form.start_time}
                      onChange={handleChange}
                      required={!form.is_flexible}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      name="end_time"
                      value={form.end_time}
                      onChange={handleChange}
                      required={!form.is_flexible}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Break (minutes)</label>
                  <input
                    type="number"
                    name="break_duration_minutes"
                    value={form.break_duration_minutes}
                    onChange={handleChange}
                    min="0"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (minutes)</label>
                  <input
                    type="number"
                    name="grace_period_minutes"
                    value={form.grace_period_minutes}
                    onChange={handleChange}
                    min="0"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none"
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                  className="rounded"
                />
                <span className="text-gray-700">Active</span>
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="text-sm px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold mb-2">Delete Shift?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove the shift. Employees assigned to it may be affected.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
