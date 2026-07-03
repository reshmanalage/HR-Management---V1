import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listCycles,
  listEmployeesInCycle,
  listAttendanceRecords,
} from "../../services/attendanceService";

const STATUS_STYLE = {
  P:   "bg-green-100 text-green-700",
  WOP: "bg-blue-100 text-blue-700",
  WO:  "bg-gray-100 text-gray-500",
  A:   "bg-red-100 text-red-600",
};

function fmt(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${((hour % 12) || 12).toString().padStart(2, "0")}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function fmtDuration(mins) {
  if (!mins) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function AttendancePage() {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState("");
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listCycles().then((data) => {
      setCycles(data);
      if (data.length > 0) setSelectedCycle(data[0].cycle_start);
    });
  }, []);

  useEffect(() => {
    if (!selectedCycle) return;
    listEmployeesInCycle(selectedCycle).then((data) => {
      setEmployees(data);
      setSelectedEmp("");
    });
  }, [selectedCycle]);

  useEffect(() => {
    if (!selectedCycle) return;
    setLoading(true);
    listAttendanceRecords(selectedCycle, selectedEmp || undefined)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [selectedCycle, selectedEmp]);

  // Group records by employee, then index by date
  const { empList, dateList, grid } = useMemo(() => {
    if (!records.length) return { empList: [], dateList: [], grid: {} };

    const empMap = {};
    const dateSet = new Set();

    for (const r of records) {
      const key = r.raw_employee_code;
      if (!empMap[key]) empMap[key] = { code: key, name: r.raw_employee_name, days: {} };
      empMap[key].days[r.date] = r;
      dateSet.add(r.date);
    }

    const dateList = Array.from(dateSet).sort();
    const empList = Object.values(empMap).sort((a, b) => a.name.localeCompare(b.name));
    return { empList, dateList, grid: empMap };
  }, [records]);

  const cycleLabel = (c) => {
    if (!c) return "";
    const found = cycles.find((x) => x.cycle_start === c);
    if (!found) return c;
    return `${found.cycle_start} → ${found.cycle_end}`;
  };

  if (cycles.length === 0 && !loading) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">No attendance data yet.</p>
        <Link
          to="/attendance/upload"
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded hover:bg-gray-700"
        >
          Import Attendance
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Attendance</h2>
          <p className="text-sm text-gray-500 mt-0.5">In / Out times by cycle</p>
        </div>
        <Link
          to="/attendance/upload"
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded hover:bg-gray-700"
        >
          Import
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={selectedCycle}
          onChange={(e) => setSelectedCycle(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          {cycles.map((c) => (
            <option key={c.cycle_start} value={c.cycle_start}>
              {c.cycle_start} → {c.cycle_end}
            </option>
          ))}
        </select>
        <select
          value={selectedEmp}
          onChange={(e) => setSelectedEmp(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="">All Employees</option>
          {employees.map((e) => (
            <option key={e.code} value={e.code}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : empList.length === 0 ? (
        <p className="text-sm text-gray-400">No records found.</p>
      ) : selectedEmp ? (
        /* Single employee detail view */
        <SingleEmployeeView emp={grid[selectedEmp]} dateList={dateList} />
      ) : (
        /* Summary table: one row per employee */
        <SummaryTable empList={empList} dateList={dateList} grid={grid} />
      )}
    </div>
  );
}

function SummaryTable({ empList, dateList, grid }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap border-r border-gray-200">
              Employee
            </th>
            {dateList.map((d) => (
              <th key={d} className="px-2 py-2 text-center font-medium text-gray-500 whitespace-nowrap">
                {d.slice(5)} {/* MM-DD */}
              </th>
            ))}
            <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">P</th>
            <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">A</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {empList.map((emp) => {
            const present = Object.values(emp.days).filter((r) => r.status === "P" || r.status === "WOP").length;
            const absent = Object.values(emp.days).filter((r) => r.status === "A").length;
            return (
              <tr key={emp.code} className="hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-3 py-2 whitespace-nowrap border-r border-gray-100 font-medium text-gray-800">
                  {emp.name}
                  <span className="ml-1 text-gray-400 font-normal">#{emp.code}</span>
                </td>
                {dateList.map((d) => {
                  const rec = emp.days[d];
                  if (!rec) return <td key={d} className="px-1 py-1 text-center text-gray-300">—</td>;
                  const style = STATUS_STYLE[rec.status] || "bg-gray-50 text-gray-500";
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${style}`}>
                        {rec.status || "—"}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-semibold text-green-700">{present}</td>
                <td className="px-3 py-2 text-center font-semibold text-red-600">{absent}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SingleEmployeeView({ emp, dateList }) {
  if (!emp) return null;
  const present = Object.values(emp.days).filter((r) => r.status === "P" || r.status === "WOP").length;
  const absent = Object.values(emp.days).filter((r) => r.status === "A").length;
  const wo = Object.values(emp.days).filter((r) => r.status === "WO" || r.status === "WOP").length;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {[
          { label: "Present", value: present, color: "text-green-700" },
          { label: "Absent", value: absent, color: "text-red-600" },
          { label: "Week Off", value: wo, color: "text-gray-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg px-5 py-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">In Time</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Out Time</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dateList.map((d) => {
              const rec = emp.days[d];
              const style = rec ? (STATUS_STYLE[rec.status] || "bg-gray-50 text-gray-500") : "";
              return (
                <tr key={d} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">
                    {new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {rec ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style}`}>
                        {rec.status}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-700">{rec ? fmt(rec.in_time) : "—"}</td>
                  <td className="px-4 py-2 text-center text-gray-700">{rec ? fmt(rec.out_time) : "—"}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{rec ? fmtDuration(rec.duration_minutes) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
