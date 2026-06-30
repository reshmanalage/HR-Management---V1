import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCurrentUser } from "../services/authService";

export default function DashboardLayout() {
  const { logout, user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, [setUser]);

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col justify-between">
        <div>
          <h1 className="text-lg font-semibold mb-6">HR Management</h1>
          {!loading && user && (
            <div className="text-sm text-gray-300 mb-6">
              <p className="font-medium text-white">
                {user.first_name} {user.last_name}
              </p>
              <p>{user.email}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                {user.roles.join(", ")}
              </p>
            </div>
          )}
        </div>
        <button onClick={logout} className="text-sm text-gray-300 hover:text-white text-left">
          Logout
        </button>
      </aside>
      <main className="flex-1 p-6 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
