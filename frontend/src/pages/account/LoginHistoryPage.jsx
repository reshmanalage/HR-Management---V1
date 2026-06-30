import { useEffect, useState } from "react";
import { getLoginHistory } from "../../services/authService";

const STATUS_STYLES = {
  SUCCESS: "text-green-600",
  FAILED: "text-red-600",
  LOCKED: "text-orange-600",
};

export default function LoginHistoryPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getLoginHistory()
      .then(setLogs)
      .catch((err) => setError(err.response?.data?.detail || "Could not load login history."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Login History</h2>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">Device / Browser</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className={`px-4 py-3 font-medium ${STATUS_STYLES[log.status] || ""}`}>
                    {log.status}
                  </td>
                  <td className="px-4 py-3">{log.ip_address || "—"}</td>
                  <td className="px-4 py-3 truncate max-w-xs">{log.user_agent || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No login history yet.
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
