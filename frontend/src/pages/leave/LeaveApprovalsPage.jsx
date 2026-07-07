import { useEffect, useState } from "react";
import { getAllApplications, getPendingForMe, decideLeave } from "../../services/leaveService";
import { getAllRegularizations, decideRegularization } from "../../services/regularizationService";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";

const STATUS_STYLES = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const TYPE_LABELS = {
  late_coming:   "Late Coming",
  early_going:   "Early Going",
  half_day:      "Half Day",
  out_of_office: "Out of Office",
};

const MAIN_TABS = [
  { key: "leave",          label: "Leave" },
  { key: "regularization", label: "Regularization" },
];

const LEAVE_TABS = [
  { key: "pending_mine", label: "Pending (for me)" },
  { key: "all",          label: "All Applications" },
];

const CAN_EDIT_ROLES = ["SUPER_ADMIN", "EXECUTIVE_ASSISTANT"];

export default function LeaveApprovalsPage() {
  const { user } = useAuth();
  const canEdit = user?.roles?.some((r) => CAN_EDIT_ROLES.includes(r));

  const [mainTab,      setMainTab]      = useState("leave");
  const [leaveTab,     setLeaveTab]     = useState("pending_mine");
  const [statusFilter, setStatusFilter] = useState("");

  const [leaves,          setLeaves]          = useState([]);
  const [regularizations, setRegularizations] = useState([]);

  const [deciding,  setDeciding]  = useState(null);  // review modal
  const [editing,   setEditing]   = useState(null);  // edit modal
  const [comment,   setComment]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  // Edit form state
  const [editForm, setEditForm] = useState({});

  useEffect(() => { loadLeaves(); }, [leaveTab, statusFilter]);
  useEffect(() => { loadRegularizations(); }, [statusFilter, mainTab]);

  async function loadLeaves() {
    try {
      setLeaves(
        leaveTab === "pending_mine"
          ? await getPendingForMe()
          : await getAllApplications(statusFilter || undefined)
      );
    } catch {}
  }

  async function loadRegularizations() {
    if (mainTab !== "regularization") return;
    try {
      setRegularizations(await getAllRegularizations(statusFilter || undefined));
    } catch {}
  }

  async function handleLeaveDecide(action) {
    if (!deciding) return;
    setSaving(true); setError("");
    try {
      await decideLeave(deciding.id, action, comment || null);
      setDeciding(null); setComment("");
      await loadLeaves();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  }

  async function handleRegDecide(action) {
    if (!deciding) return;
    setSaving(true); setError("");
    try {
      await decideRegularization(deciding.id, action, comment || null);
      setDeciding(null); setComment("");
      await loadRegularizations();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  }

  function openEdit(app) {
    setEditing(app);
    setEditForm({
      from_date:       app.from_date,
      to_date:         app.to_date,
      reason:          app.reason || "",
      is_half_day:     app.is_half_day,
      half_day_period: app.half_day_period || "",
    });
    setError("");
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true); setError("");
    try {
      const payload = {
        from_date:       editForm.from_date || null,
        to_date:         editForm.to_date || null,
        reason:          editForm.reason || null,
        is_half_day:     editForm.is_half_day,
        half_day_period: editForm.half_day_period || null,
      };
      await api.patch(`/leave/applications/${editing.id}`, payload);
      setEditing(null);
      await loadLeaves();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Approvals</h1>
      </div>

      {/* Main tabs */}
      <div className="flex gap-3 mb-6">
        {MAIN_TABS.map((t) => (
          <button key={t.key} onClick={() => { setMainTab(t.key); setStatusFilter(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mainTab === t.key ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100 shadow"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Leave section ── */}
      {mainTab === "leave" && (
        <>
          <div className="flex gap-3 mb-4 items-center">
            {LEAVE_TABS.map((t) => (
              <button key={t.key} onClick={() => { setLeaveTab(t.key); setStatusFilter(""); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${leaveTab === t.key ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-100 shadow"}`}>
                {t.label}
              </button>
            ))}
            {leaveTab === "all" && (
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
                {leaves.map((a) => (
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
                        <p className="text-xs text-gray-400 mt-0.5">by {a.approvals[0].approver_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(a.applied_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {a.status === "pending" && canEdit && (
                          <button onClick={() => openEdit(a)}
                            className="text-gray-500 hover:underline text-xs">
                            Edit
                          </button>
                        )}
                        {a.status === "pending" && (
                          <button onClick={() => { setDeciding({ ...a, _kind: "leave" }); setComment(""); setError(""); }}
                            className="text-indigo-600 hover:underline text-xs">
                            Review
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    {leaveTab === "pending_mine" ? "No pending leave for you" : "No leave applications found"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Regularization section ── */}
      {mainTab === "regularization" && (
        <>
          <div className="flex gap-3 mb-4 items-center">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Time Details</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Applied</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {regularizations.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.employee_name}</p>
                      <p className="text-xs text-gray-400">{r.employee_code}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">{TYPE_LABELS[r.type] ?? r.type}</td>
                    <td className="px-4 py-3 text-gray-600">{r.date}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.type === "late_coming"   && r.in_time   && <span>Arrives: {r.in_time}</span>}
                      {r.type === "early_going"   && r.out_time  && <span>Leaves: {r.out_time}</span>}
                      {r.type === "half_day"      && <span>{r.in_time && `In: ${r.in_time}`}{r.in_time && r.out_time && " / "}{r.out_time && `Out: ${r.out_time}`}</span>}
                      {r.type === "out_of_office" && r.out_from  && <span>{r.out_from} – {r.out_till}</span>}
                      {!r.in_time && !r.out_time && !r.out_from && "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.reason || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                      {r.comment && <p className="text-xs text-gray-400 mt-0.5 italic">{r.comment}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.applied_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" && (
                        <button onClick={() => { setDeciding({ ...r, _kind: "reg" }); setComment(""); setError(""); }}
                          className="text-indigo-600 hover:underline text-xs">
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {regularizations.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No regularization requests found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Decision modal ── */}
      {deciding && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">
              Review {deciding._kind === "leave" ? "Leave" : "Regularization"} Request
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {deciding.employee_name}
              {deciding._kind === "leave"
                ? ` · ${deciding.leave_type_name} · ${deciding.days} day(s) · ${deciding.from_date}${deciding.from_date !== deciding.to_date ? ` → ${deciding.to_date}` : ""}`
                : ` · ${TYPE_LABELS[deciding.type] ?? deciding.type} · ${deciding.date}`
              }
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
                Close
              </button>
              <button
                onClick={() => deciding._kind === "leave" ? handleLeaveDecide("rejected") : handleRegDecide("rejected")}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? "…" : "Reject"}
              </button>
              <button
                onClick={() => deciding._kind === "leave" ? handleLeaveDecide("approved") : handleRegDecide("approved")}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
                {saving ? "…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit leave modal ── */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Edit Leave Application</h2>
            <p className="text-sm text-gray-500 mb-4">
              {editing.employee_name} · {editing.leave_type_name}
            </p>
            {error && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                  <input type="date" value={editForm.from_date}
                    onChange={(e) => setEditForm((p) => ({ ...p, from_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                  <input type="date" value={editForm.to_date}
                    onChange={(e) => setEditForm((p) => ({ ...p, to_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={editForm.is_half_day}
                    onChange={(e) => setEditForm((p) => ({ ...p, is_half_day: e.target.checked }))}
                    className="rounded" />
                  Half Day
                </label>
                {editForm.is_half_day && (
                  <select value={editForm.half_day_period}
                    onChange={(e) => setEditForm((p) => ({ ...p, half_day_period: e.target.value }))}
                    className="border rounded-lg px-3 py-2 text-sm">
                    <option value="">— period —</option>
                    <option value="first_half">First Half</option>
                    <option value="second_half">Second Half</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                <textarea value={editForm.reason}
                  onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))}
                  rows={3} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setEditing(null); setError(""); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
