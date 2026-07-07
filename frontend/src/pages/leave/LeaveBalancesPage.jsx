import { useEffect, useState } from "react";
import {
  initLeaveBalances,
  initLeaveBalancesBulk,
  getEmployeeBalances,
} from "../../services/leaveService";
import api from "../../services/api";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export default function LeaveBalancesPage() {
  const [year, setYear]           = useState(CURRENT_YEAR);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState("");

  // Bulk init state
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult,  setBulkResult]  = useState(null);
  const [bulkError,   setBulkError]   = useState("");

  // Individual init state
  const [selectedEmp,   setSelectedEmp]   = useState(null);
  const [indivLoading,  setIndivLoading]  = useState(false);
  const [indivResult,   setIndivResult]   = useState(null);
  const [indivError,    setIndivError]    = useState("");

  // View balances state
  const [viewEmp,      setViewEmp]      = useState(null);
  const [viewBalances, setViewBalances] = useState([]);
  const [viewLoading,  setViewLoading]  = useState(false);

  useEffect(() => {
    api.get("/employees")
      .then((r) => setEmployees(Array.isArray(r.data) ? r.data : (r.data?.items ?? [])))
      .catch(() => {});
  }, []);

  const filteredEmps = empSearch.trim().length < 2
    ? []
    : employees.filter((e) => {
        const q = empSearch.toLowerCase();
        return (
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
          (e.employee_code || "").toLowerCase().includes(q)
        );
      }).slice(0, 10);

  async function handleBulkInit() {
    if (!confirm(`Initialize leave balances for ALL active employees for ${year}?\n\nEmployees who already have balances for ${year} will be skipped.`)) return;
    setBulkLoading(true); setBulkResult(null); setBulkError("");
    try {
      setBulkResult(await initLeaveBalancesBulk(year));
    } catch (err) {
      setBulkError(err.response?.data?.detail || "Bulk init failed");
    } finally { setBulkLoading(false); }
  }

  async function handleIndivInit() {
    if (!selectedEmp) return;
    setIndivLoading(true); setIndivResult(null); setIndivError("");
    try {
      const balances = await initLeaveBalances({ employee_id: selectedEmp.id, year });
      setIndivResult({ name: `${selectedEmp.first_name} ${selectedEmp.last_name}`, balances });
    } catch (err) {
      setIndivError(err.response?.data?.detail || "Init failed");
    } finally { setIndivLoading(false); }
  }

  async function handleViewBalances(emp) {
    setViewEmp(emp); setViewBalances([]); setViewLoading(true);
    try {
      setViewBalances(await getEmployeeBalances(emp.id, year));
    } catch {}
    finally { setViewLoading(false); }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Leave Balances</h1>
          <p className="text-sm text-gray-500 mt-0.5">Initialize and manage employee leave allocations</p>
        </div>

        {/* Year selector */}
        <select
          value={year}
          onChange={(e) => { setYear(+e.target.value); setBulkResult(null); setIndivResult(null); setViewEmp(null); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* ── Bulk Init ── */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Bulk Initialize — All Employees</h2>
            <p className="text-sm text-gray-500 mt-1">
              Creates leave balance rows for every <strong>active</strong> employee for <strong>{year}</strong>.
              Employees who already have a balance for {year} are skipped automatically.
            </p>
          </div>
          <button
            onClick={handleBulkInit}
            disabled={bulkLoading}
            className="shrink-0 px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {bulkLoading ? "Initializing…" : `Initialize All for ${year}`}
          </button>
        </div>

        {bulkError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{bulkError}</p>
        )}

        {bulkResult && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            {[
              { label: "Employees processed", value: bulkResult.employees, color: "text-gray-700" },
              { label: "Balances initialized", value: bulkResult.initialized, color: "text-green-700" },
              { label: "Already existed (skipped)", value: bulkResult.skipped, color: "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Individual Init ── */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Individual Employee</h2>
        <p className="text-sm text-gray-500 mb-4">
          Search for an employee to initialize their leave balance or view their current allocation for {year}.
        </p>

        {/* Search */}
        <div className="relative mb-4">
          <input
            type="text"
            value={empSearch}
            onChange={(e) => { setEmpSearch(e.target.value); setSelectedEmp(null); setIndivResult(null); setIndivError(""); }}
            placeholder="Search by name or employee code…"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          {filteredEmps.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-52 overflow-y-auto mt-1">
              {filteredEmps.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedEmp(e); setEmpSearch(`${e.first_name} ${e.last_name}`); setIndivResult(null); setIndivError(""); setViewEmp(null); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm flex items-center gap-3"
                >
                  <span className="font-medium text-gray-800">{e.first_name} {e.last_name}</span>
                  <span className="text-gray-400 text-xs">{e.employee_code}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedEmp && (
          <div className="flex gap-3">
            <button
              onClick={handleIndivInit}
              disabled={indivLoading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {indivLoading ? "Initializing…" : `Initialize for ${year}`}
            </button>
            <button
              onClick={() => handleViewBalances(selectedEmp)}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              View Current Balances
            </button>
          </div>
        )}

        {indivError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{indivError}</p>
        )}

        {indivResult && (
          <div className="mt-4">
            <p className="text-sm font-medium text-green-700 mb-2">
              Balances initialized for {indivResult.name} — {year}
            </p>
            <BalanceTable balances={indivResult.balances} />
          </div>
        )}

        {/* View balances panel */}
        {viewEmp && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {viewEmp.first_name} {viewEmp.last_name} — {year} balances
            </p>
            {viewLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : viewBalances.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded">
                No leave balance found for {year}. Click "Initialize for {year}" to set it up.
              </p>
            ) : (
              <BalanceTable balances={viewBalances} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceTable({ balances }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
          <tr>
            <th className="px-4 py-2 text-left">Leave Type</th>
            <th className="px-4 py-2 text-center">Allocated</th>
            <th className="px-4 py-2 text-center">Carry Forward</th>
            <th className="px-4 py-2 text-center">Used</th>
            <th className="px-4 py-2 text-center">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {balances.map((b) => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-800">
                {b.leave_type_name}
                <span className="ml-1.5 text-xs text-gray-400 font-normal">{b.leave_type_code}</span>
              </td>
              <td className="px-4 py-2 text-center text-gray-700">{b.allocated}</td>
              <td className="px-4 py-2 text-center text-gray-500">{b.carried_forward}</td>
              <td className="px-4 py-2 text-center text-gray-500">{b.used}</td>
              <td className="px-4 py-2 text-center font-semibold text-indigo-700">{b.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
