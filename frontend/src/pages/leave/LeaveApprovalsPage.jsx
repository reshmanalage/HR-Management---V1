import { useEffect, useState } from "react";
import { getAllApplications, getPendingForMe, decideLeave } from "../../services/leaveService";

const STATUS_STYLES = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const TABS = [
  { key: "pending_mine", label: "Pending (for me)" },
  { key: "all", label: "All Applications" },
];

export default function LeaveApprovalsPage() {
  const [tab, setTab] = useState("pending_mine");
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [deciding, setDeciding] = useState(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [tab, statusFilter]);

  async function load() {
    try {
      if (tab === "pending_mine") {
        setApplications(await getPendingForMe());
      } else {
        setApplications(await getAllApplications(statusFilter || undefined));
      }
    } catch {}
  }

  async function handleDecide(action) {
    if (!deciding) return;
    setSaving(true); setError("");
    try {
      await decideLeave(deciding.id, action, comment || null);
      setDeciding(null); setComment("");
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Leave Approvals</h1>
      </div>

      <div className="flex gap-4 mb-6">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100 shadow"}`}>
            {t.label}
          </button>
        ))}

        {tab === "all" && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-auto border rounded-lg px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-left">Leave Type</th>
              <th className="px-4 py-3 text-left">From</th>
              <th className="px-4 py-3 text-left">To</th>
              <th className="px-4 py-3 text-left">Days</th>
              <th className="px-4 py-3 text-left">Reason</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Applied</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {applications.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{a.employee_name}</p>
                  <p className="text-xs text-gray-400">{a.employee_code}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {a.leave_type_name}
                  {a.is_half_day && <span className="ml-1 text-xs text-gray-400">({a.half_day_period})</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{a.from_date}</td>
                <td className="px-4 py-3 text-gray-600">{a.to_date}</td>
                <td className="px-4 py-3 text-gray-700">{a.days}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{a.reason || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>
                    {a.status}
                  </span>
                  {a.approvals?.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      by {a.approvals[0].approver_name}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(a.applied_at).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.status === "pending" && (
                    <button onClick={() => { setDeciding(a); setComment(""); setError(""); }}
                      className="text-indigo-600 hover:underline text-xs">
                      Review
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {applications.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  {tab === "pending_mine" ? "No pending applications for you" : "No applications found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Decision modal */}
      {deciding && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Review Leave Request</h2>
            <p className="text-sm text-gray-500 mb-4">
              {deciding.employee_name} · {deciding.leave_type_name} · {deciding.days} day(s)
              <br />{deciding.from_date}{deciding.from_date !== deciding.to_date ? ` → ${deciding.to_date}` : ""}
            </p>
            {deciding.reason && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                <span className="text-xs font-medium text-gray-400 uppercase block mb-1">Reason</span>
                {deciding.reason}
              </div>
            )}
            {error && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Comment (optional)</label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeciding(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button onClick={() => handleDecide("rejected")} disabled={saving}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? "…" : "Reject"}
              </button>
              <button onClick={() => handleDecide("approved")} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
                {saving ? "…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
