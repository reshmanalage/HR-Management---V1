import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEmployees, deactivateEmployee } from "../../services/employeeService";

const AVATAR_COLORS = ["bg-indigo-500","bg-violet-500","bg-pink-500","bg-rose-500","bg-orange-500","bg-amber-500","bg-teal-500","bg-cyan-500","bg-sky-500","bg-emerald-500"];
function avatarColor(name) { let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))&0xff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function initials(f,l) { return ((f?.[0]??"")+( l?.[0]??"")).toUpperCase() || "?"; }

const STATUS_STYLES = {
  active:        "bg-green-100 text-green-700",
  probation:     "bg-yellow-100 text-yellow-700",
  notice_period: "bg-orange-100 text-orange-700",
  inactive:      "bg-gray-100 text-gray-500",
  terminated:    "bg-red-100 text-red-600",
};

const STATUS_LABELS = {
  active:        "Active",
  probation:     "Probation",
  notice_period: "Notice Period",
  inactive:      "Inactive",
  terminated:    "Terminated",
};

export default function EmployeeListPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  async function load() {
    try {
      const data = await listEmployees();
      setEmployees(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDeactivate(e, id, name) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Deactivate ${name}?`)) return;
    await deactivateEmployee(id);
    setEmployees((prev) => prev.filter((emp) => emp.id !== id));
  }

  const departments = [...new Set(employees.map((e) => e.department?.name).filter(Boolean))].sort();

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q) ||
      (e.company_email ?? "").toLowerCase().includes(q) ||
      (e.mobile_number ?? "").includes(q) ||
      (e.department?.name ?? "").toLowerCase().includes(q);
    const matchDept = !filterDept || e.department?.name === filterDept;
    const matchStatus = !filterStatus || e.employee_status === filterStatus;
    return matchSearch && matchDept && matchStatus;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees.length} total</p>
        </div>
        <Link
          to="/employees/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Add Employee
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search name, code, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
        />
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        {(search || filterDept || filterStatus) && (
          <button
            onClick={() => { setSearch(""); setFilterDept(""); setFilterStatus(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No employees match your filters.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mobile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((emp) => {
                const name = `${emp.first_name} ${emp.last_name}`.trim();
                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => window.location.href = `/employees/${emp.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {emp.photo_url ? (
                          <img src={emp.photo_url} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(name)}`}>
                            {initials(emp.first_name, emp.last_name)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{name}</p>
                          {emp.company_email && <p className="text-xs text-gray-400">{emp.company_email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{emp.employee_code}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.department?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.designation?.title ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.mobile_number ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[emp.employee_status] ?? "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[emp.employee_status] ?? emp.employee_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/employees/${emp.id}/edit`} className="text-indigo-600 hover:underline text-xs">
                          Edit
                        </Link>
                        <button
                          onClick={(e) => handleDeactivate(e, emp.id, name)}
                          className="text-red-500 hover:underline text-xs"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
