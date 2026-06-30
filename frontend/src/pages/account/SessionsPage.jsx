import { useEffect, useState } from "react";
import { listSessions, revokeSession } from "../../services/authService";

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revokingId, setRevokingId] = useState(null);

  function load() {
    setLoading(true);
    listSessions()
      .then(setSessions)
      .catch((err) => setError(err.response?.data?.detail || "Could not load sessions."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRevoke(sessionId) {
    setRevokingId(sessionId);
    try {
      await revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setError(err.response?.data?.detail || "Could not revoke session.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Active Sessions</h2>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && (
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Device / Browser</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 truncate max-w-xs">
                    {session.device_label || session.user_agent || "Unknown device"}
                  </td>
                  <td className="px-4 py-3">{session.ip_address || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(session.last_active_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRevoke(session.id)}
                      disabled={revokingId === session.id}
                      className="text-red-600 hover:underline text-sm disabled:opacity-50"
                    >
                      {revokingId === session.id ? "Revoking..." : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No active sessions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
