import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, adminResetPassword } from "../../services/userService";
import { getUserModules, setUserModules } from "../../services/moduleAccessService";
import { useAuth } from "../../context/AuthContext";

const ALL_MODULES = [
  { key: "employees",  label: "Employee Management" },
  { key: "attendance", label: "Attendance" },
  { key: "leave",      label: "Leave & Regularization" },
  { key: "shifts",     label: "Shift Timings" },
  { key: "admin",      label: "Admin (Users, Sessions)" },
];

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

export default function UserListPage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.roles?.includes("SUPER_ADMIN");

  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [visiblePwd, setVisiblePwd] = useState({});

  // Reset password modal
  const [resetting, setResetting]   = useState(null);
  const [newPwd, setNewPwd]         = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  // Module access modal
  const [accessUser,   setAccessUser]   = useState(null);   // user object
  const [accessModules, setAccessModules] = useState([]);   // currently selected modules
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving,  setAccessSaving]  = useState(false);
  const [accessError,   setAccessError]   = useState("");

  async function load() {
    setLoading(true);
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err.response?.data?.detail || "Could not load users."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function togglePwd(id) {
    setVisiblePwd((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!newPwd.trim()) return;
    setResetSaving(true); setResetError("");
    try {
      const updated = await adminResetPassword(resetting, newPwd.trim());
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setResetting(null); setNewPwd("");
    } catch (err) {
      setResetError(err.response?.data?.detail || "Reset failed");
    } finally { setResetSaving(false); }
  }

  async function openAccessModal(user) {
    setAccessUser(user);
    setAccessError("");
    setAccessLoading(true);
    try {
      const data = await getUserModules(user.id);
      setAccessModules(data.modules);
    } catch {
      setAccessModules([]);
    } finally { setAccessLoading(false); }
  }

  function toggleModule(key) {
    setAccessModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  async function handleSaveAccess() {
    setAccessSaving(true); setAccessError("");
    try {
      await setUserModules(accessUser.id, accessModules);
      setAccessUser(null);
    } catch (err) {
      setAccessError(err.response?.data?.detail || "Save failed");
    } finally { setAccessSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Users</h2>
        <Link to="/users/new" className="bg-gray-900 text-white text-sm font-medium rounded px-4 py-2">
          + Create User
        </Link>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error   && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3">Password</th>}
                <th className="px-4 py-3">Created</th>
                {isSuperAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {user.first_name} {user.last_name}
                    {user.employee_code && (
                      <span className="ml-1 text-xs text-gray-400">#{user.employee_code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">{user.roles.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    {user.is_locked ? (
                      <span className="text-red-600">Locked</span>
                    ) : user.is_active ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-gray-400">Inactive</span>
                    )}
                  </td>

                  {isSuperAdmin && (
                    <td className="px-4 py-3">
                      {user.plain_password ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-700">
                            {visiblePwd[user.id] ? user.plain_password : "••••••••"}
                          </span>
                          <button onClick={() => togglePwd(user.id)} className="text-gray-400 hover:text-gray-600">
                            <EyeIcon open={visiblePwd[user.id]} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">user-set</span>
                      )}
                    </td>
                  )}

                  <td className="px-4 py-3 text-gray-500">
                    {new Date(user.created_at).toLocaleDateString("en-IN")}
                  </td>

                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        {!user.roles.includes("SUPER_ADMIN") && (
                          <button
                            onClick={() => openAccessModal(user)}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Module Access
                          </button>
                        )}
                        <button
                          onClick={() => { setResetting(user.id); setNewPwd(""); setResetError(""); }}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Reset Password
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 7 : 5} className="px-4 py-6 text-center text-gray-400">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset password modal */}
      {resetting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-1">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-4">{users.find((u) => u.id === resetting)?.email}</p>
            {resetError && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{resetError}</div>}
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Password *</label>
                <input required type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Enter new password" className="w-full border rounded-lg px-3 py-2 text-sm font-mono" autoFocus />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setResetting(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={resetSaving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {resetSaving ? "Saving…" : "Set Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module access modal */}
      {accessUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Module Access</h2>
            <p className="text-sm text-gray-500 mb-5">
              {accessUser.first_name} {accessUser.last_name}
              <span className="ml-1.5 text-gray-400">({accessUser.email})</span>
            </p>

            {accessError && <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{accessError}</div>}

            {accessLoading ? (
              <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
            ) : (
              <div className="space-y-2">
                {ALL_MODULES.map((mod) => (
                  <label
                    key={mod.key}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      accessModules.includes(mod.key)
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={accessModules.includes(mod.key)}
                      onChange={() => toggleModule(mod.key)}
                      className="rounded accent-indigo-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{mod.label}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setAccessUser(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveAccess} disabled={accessSaving || accessLoading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {accessSaving ? "Saving…" : "Save Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
