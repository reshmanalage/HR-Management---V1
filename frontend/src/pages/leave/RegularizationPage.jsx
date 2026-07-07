import { useEffect, useState } from "react";
import {
  applyRegularization,
  cancelRegularization,
  getMyRegularizations,
} from "../../services/regularizationService";

const STATUS_STYLES = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const TYPE_LABELS = {
  late_coming:    "Late Coming",
  early_going:    "Early Going",
  half_day:       "Half Day",
  out_of_office:  "Out of Office",
};

const EMPTY_FORM = {
  type: "late_coming",
  date: "",
  in_time: "",
  out_time: "",
  out_from: "",
  out_till: "",
  reason: "",
};

export default function RegularizationPage() {
  const [records, setRecords] = useState([]);
  const [showApply, setShowApply] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setRecords(await getMyRegularizations().catch(() => []));
  }

  function f(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = {
        type:     form.type,
        date:     form.date,
        reason:   form.reason || null,
        in_time:  form.in_time  || null,
        out_time: form.out_time || null,
        out_from: form.out_from || null,
        out_till: form.out_till || null,
      };
      await applyRegularization(payload);
      setShowApply(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to submit");
    } finally { setSaving(false); }
  }

  async function handleCancel(rec) {
    if (!confirm("Cancel this request?")) return;
    try { await cancelRegularization(rec.id); await load(); }
    catch (err) { alert(err.response?.data?.detail || "Cannot cancel"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Regularization</h1>
          <p className="text-sm text-gray-500 mt-0.5">Apply for late coming, early going, half day, or out-of-office break</p>
        </div>
        <button
          onClick={() => { setShowApply(true); setError(""); setForm(EMPTY_FORM); }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          + New Request
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Time Details</th>
              <th className="px-4 py-3 text-left">Reason</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Applied</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {r.type === "late_coming"   && r.in_time   && <span>Arrives: {r.in_time}</span>}
                  {r.type === "early_going"   && r.out_time  && <span>Leaves: {r.out_time}</span>}
                  {r.type === "half_day"      && (r.in_time || r.out_time) && (
                    <span>{r.in_time && `In: ${r.in_time}`}{r.in_time && r.out_time && " / "}{r.out_time && `Out: ${r.out_time}`}</span>
                  )}
                  {r.type === "out_of_office" && r.out_from && r.out_till && (
                    <span>{r.out_from} – {r.out_till}</span>
                  )}
                  {!r.in_time && !r.out_time && !r.out_from && "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.reason || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                  {r.comment && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">{r.comment}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(r.applied_at).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" && (
                    <button onClick={() => handleCancel(r)} className="text-red-500 hover:underline text-xs">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No regularization requests yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Apply modal */}
      {showApply && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-screen overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">New Regularization Request</h2>
            {error && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Request Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <label
                      key={val}
                      className={`flex items-center justify-center gap-1.5 border rounded-lg px-3 py-2 text-sm cursor-pointer transition ${
                        form.type === val
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                          : "border-gray-200 text-gray-600 hover:border-indigo-300"
                      }`}
                    >
                      <input
                        type="radio"
                        className="hidden"
                        value={val}
                        checked={form.type === val}
                        onChange={() => f("type", val)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                <input
                  required type="date" value={form.date}
                  onChange={(e) => f("date", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Late coming — in_time required */}
              {form.type === "late_coming" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expected Arrival Time *</label>
                  <input
                    required type="time" value={form.in_time}
                    onChange={(e) => f("in_time", e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Early going — out_time required */}
              {form.type === "early_going" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Departure Time *</label>
                  <input
                    required type="time" value={form.out_time}
                    onChange={(e) => f("out_time", e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Half day — both optional */}
              {form.type === "half_day" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">In Time</label>
                    <input type="time" value={form.in_time}
                      onChange={(e) => f("in_time", e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Out Time</label>
                    <input type="time" value={form.out_time}
                      onChange={(e) => f("out_time", e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* Out of office — out_from/out_till required, min 3hrs */}
              {form.type === "out_of_office" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Out-of-Office Period * <span className="text-gray-400">(min 3 hours)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">From</label>
                      <input
                        required type="time" value={form.out_from}
                        onChange={(e) => f("out_from", e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Till</label>
                      <input
                        required type="time" value={form.out_till}
                        onChange={(e) => f("out_till", e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => f("reason", e.target.value)}
                  rows={3}
                  placeholder="Brief reason for the request…"
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowApply(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
