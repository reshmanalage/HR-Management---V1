import { useEffect, useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCurrentUser, sendVerificationEmail } from "../services/authService";

export default function DashboardLayout() {
  const { logout, user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, [setUser]);

  async function handleSendVerification() {
    await sendVerificationEmail();
    setVerificationSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {!loading && user && !user.is_email_verified && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm px-4 py-2 flex items-center justify-between">
          <span>Your email address is not verified.</span>
          {verificationSent ? (
            <span className="text-yellow-600">Verification email sent — check your inbox.</span>
          ) : (
            <button onClick={handleSendVerification} className="underline font-medium">
              Send verification email
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1">
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
            <nav className="flex flex-col gap-1 text-sm">
              <p className="text-xs uppercase tracking-wider text-gray-500 mt-2 mb-1 px-1">Employees</p>
              <Link to="/employees" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                All Employees
              </Link>
              <Link to="/employees/bulk-upload" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Bulk Import
              </Link>

              <p className="text-xs uppercase tracking-wider text-gray-500 mt-4 mb-1 px-1">Leave</p>
              <Link to="/leave/my" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                My Leaves
              </Link>
              <Link to="/leave/approvals" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Approvals
              </Link>
              <Link to="/leave/types" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Leave Types
              </Link>
              <Link to="/leave/holidays" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Holidays
              </Link>

              <p className="text-xs uppercase tracking-wider text-gray-500 mt-4 mb-1 px-1">Attendance</p>
              <Link to="/shifts" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Shift Timings
              </Link>

              <p className="text-xs uppercase tracking-wider text-gray-500 mt-4 mb-1 px-1">Admin</p>
              <Link to="/users" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Users
              </Link>
              <Link to="/sessions" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Active Sessions
              </Link>
              <Link to="/login-history" className="text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
                Login History
              </Link>
            </nav>
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/change-password" className="text-sm text-gray-300 hover:text-white">
              Change Password
            </Link>
            <button onClick={logout} className="text-sm text-gray-300 hover:text-white text-left">
              Logout
            </button>
          </div>
        </aside>
        <main className="flex-1 p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
