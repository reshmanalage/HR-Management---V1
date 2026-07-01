import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEmployees, deactivateEmployee } from "../../services/employeeService";

const PLACEHOLDER = "https://ui-avatars.com/api/?background=6366f1&color=fff&size=80&name=";

export default function EmployeeListPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const data = await listEmployees();
      setEmployees(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDeactivate(id, name) {
    if (!confirm(`Deactivate ${name}?`)) return;
    await deactivateEmployee(id);
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q) ||
      (e.department?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
        <Link
          to="/employees/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          + Add Employee
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, code, email, or department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-96 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No employees found.</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Designation</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={emp.photo_url || `${PLACEHOLDER}${encodeURIComponent(emp.first_name + "+" + emp.last_name)}`}
                        alt={`${emp.first_name} ${emp.last_name}`}
                        className="w-9 h-9 rounded-full object-cover bg-indigo-100"
                        onError={(e) => {
                          e.target.src = `${PLACEHOLDER}${encodeURIComponent(emp.first_name + "+" + emp.last_name)}`;
                        }}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                        {emp.email && <p className="text-xs text-gray-500">{emp.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{emp.employee_code}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.designation?.title ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/employees/${emp.id}/edit`}
                        className="text-indigo-600 hover:underline text-xs"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDeactivate(emp.id, `${emp.first_name} ${emp.last_name}`)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
