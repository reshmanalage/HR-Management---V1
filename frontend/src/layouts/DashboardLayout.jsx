import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCurrentUser, sendVerificationEmail } from "../services/authService";

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const Icon = ({ d, className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICONS = {
  employees:      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  bulkImport:     "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  myLeaves:       "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  leaveBalances:  "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  regularization: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  approvals:      "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  leaveTypes:     "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  holidays:       "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  shifts:         "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  attendance:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  importAtt:      "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  users:          "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  sessions:       "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2",
  loginHistory:   "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  policy:         "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  lop:            "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  password:       "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  logout:         "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
};

function NavItem({ to, icon, label, exact = false }) {
  const { pathname } = useLocation();
  const active = exact ? pathname === to : pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-700/60"
      }`}
    >
      <Icon d={ICONS[icon]} className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

function NavSection({ label }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mt-5 mb-1 px-3">
      {label}
    </p>
  );
}

function UserAvatar({ name }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials || "?"}
    </div>
  );
}

export default function DashboardLayout() {
  const { logout, user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [verificationSent, setVerificationSent] = useState(false);
  const location = useLocation();

  const hasModule = (mod) => !user || (user.modules ?? []).includes(mod);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, [setUser]);

  async function handleSendVerification() {
    await sendVerificationEmail();
    setVerificationSent(true);
  }

  const fullName = user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() : "";

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Email verification banner */}
      {!loading && user && !user.is_email_verified && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-5 py-2.5 flex items-center justify-between z-10 shrink-0">
          <span className="flex items-center gap-2">
            <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-4 h-4 text-amber-500 shrink-0" />
            Your email address is not verified.
          </span>
          {verificationSent ? (
            <span className="text-amber-600 text-xs">Verification email sent — check your inbox.</span>
          ) : (
            <button onClick={handleSendVerification} className="text-xs font-semibold underline">
              Send verification email
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ──────────────────────────────────────── */}
        <aside className="w-60 bg-slate-900 flex flex-col shrink-0">
          {/* Logo */}
          <div className="px-4 pt-5 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-bold leading-none">HR Portal</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Management System</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-3 space-y-0.5">
            {hasModule("employees") && (
              <>
                <NavSection label="Employees" />
                <NavItem to="/employees" icon="employees" label="All Employees" />
                <NavItem to="/employees/bulk-upload" icon="bulkImport" label="Bulk Import" />
              </>
            )}

            {hasModule("leave") && (
              <>
                <NavSection label="Leave" />
                <NavItem to="/leave/my" icon="myLeaves" label="My Leaves" />
                <NavItem to="/leave/balances" icon="leaveBalances" label="Leave Balances" />
                <NavItem to="/leave/regularization" icon="regularization" label="Regularization" />
                <NavItem to="/leave/approvals" icon="approvals" label="Approvals" />
                <NavItem to="/leave/types" icon="leaveTypes" label="Leave Types" />
                <NavItem to="/leave/holidays" icon="holidays" label="Holidays" />
              </>
            )}

            {(hasModule("attendance") || hasModule("shifts")) && (
              <>
                <NavSection label="Attendance" />
                {hasModule("shifts") && (
                  <NavItem to="/shifts" icon="shifts" label="Shift Timings" />
                )}
                {hasModule("attendance") && (
                  <>
                    <NavItem to="/attendance" icon="attendance" label="Attendance" />
                    <NavItem to="/attendance/upload" icon="importAtt" label="Import Attendance" />
                  </>
                )}
              </>
            )}

            {hasModule("admin") && (
              <>
                <NavSection label="Admin" />
                <NavItem to="/users" icon="users" label="Users" />
                <NavItem to="/sessions" icon="sessions" label="Active Sessions" />
                <NavItem to="/login-history" icon="loginHistory" label="Login History" />
              </>
            )}

            {hasModule("attendance") && (
              <>
                <NavSection label="Payroll" />
                <NavItem to="/payroll/policy" icon="policy" label="Payroll Policy" />
                <NavItem to="/payroll/lop-report" icon="lop" label="LOP Report" />
              </>
            )}
          </nav>

        </aside>

        {/* ── Main content ─────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-h-0">
          {/* Top header bar */}
          {!loading && user && (
            <header className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-end gap-3 shrink-0">
              <Link
                to="/change-password"
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors"
              >
                <Icon d={ICONS.password} className="w-3.5 h-3.5" />
                Change Password
              </Link>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-2">
                <UserAvatar name={fullName} />
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-700">{fullName}</p>
                  {user.roles?.length > 0 && (
                    <p className="text-[10px] text-indigo-500 uppercase tracking-wide">{user.roles.join(", ")}</p>
                  )}
                </div>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-500 font-medium transition-colors"
              >
                <Icon d={ICONS.logout} className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </header>
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-screen-xl mx-auto w-full">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
