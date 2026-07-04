import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listCycles,
  listEmployeesInCycle,
  listAttendanceRecords,
  updateAttendanceRecord,
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
        <SingleEmployeeView
          emp={grid[selectedEmp]}
          dateList={dateList}
          onBack={() => setSelectedEmp("")}
        />
      ) : (
        /* Summary table: one row per employee */
        <SummaryTable empList={empList} dateList={dateList} grid={grid} onSelect={setSelectedEmp} />
      )}
    </div>
  );
}

function SummaryTable({ empList, dateList, grid, onSelect }) {
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
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {empList.map((emp) => (
            <tr key={emp.code} className="hover:bg-gray-50">
              <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-3 py-2 whitespace-nowrap border-r border-gray-100">
                <button
                  onClick={() => onSelect(emp.code)}
                  className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                >
                  {emp.name}
                </button>
                <span className="ml-1 text-gray-400 text-[11px]">#{emp.code}</span>
              </td>
              {dateList.map((d) => {
                const rec = emp.days[d];
                if (!rec) return <td key={d} className="px-1 py-1 text-center text-gray-200">—</td>;

                const isAbsent = rec.status === "A";
                const isOff = rec.status === "WO";

                if (isAbsent) {
                  return (
                    <td key={d} className="px-1 py-1 text-center bg-red-50">
                      <span className="block text-[10px] font-semibold text-red-500">Absent</span>
                    </td>
                  );
                }
                if (isOff) {
                  return (
                    <td key={d} className="px-1 py-1 text-center bg-gray-50">
                      <span className="block text-[10px] text-gray-400">Off</span>
                    </td>
                  );
                }
                const incomplete = !rec.in_time || !rec.out_time;
                const cellBg = incomplete ? "bg-amber-50" : "bg-green-50";
                return (
                  <td key={d} className={`px-1 py-1 text-center ${cellBg}`}>
                    <span className={`block text-[10px] font-medium leading-tight ${rec.in_time ? (incomplete ? "text-amber-700" : "text-green-700") : "text-red-400"}`}>
                      {rec.in_time ?? "—"}
                    </span>
                    <span className={`block text-[10px] leading-tight ${rec.out_time ? (incomplete ? "text-amber-600" : "text-green-600") : "text-red-400"}`}>
                      {rec.out_time ?? "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SingleEmployeeView({ emp, dateList, onBack }) {
  const [days, setDays] = useState(() => emp?.days ?? {});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ in_time: "", out_time: "", status: "" });
  const [saving, setSaving] = useState(false);

  if (!emp) return null;

  const allDays = Object.values(days);
  const present = allDays.filter((r) => r.status === "P" || r.status === "WOP").length;
  const absent = allDays.filter((r) => r.status === "A").length;
  const wo = allDays.filter((r) => r.status === "WO" || r.status === "WOP").length;

  function startEdit(rec) {
    setEditingId(rec.id);
    setEditForm({ in_time: rec.in_time ?? "", out_time: rec.out_time ?? "", status: rec.status ?? "" });
  }

  function cancelEdit() { setEditingId(null); }

  async function saveEdit(rec) {
    setSaving(true);
    try {
      const updated = await updateAttendanceRecord(rec.id, {
        in_time: editForm.in_time || null,
        out_time: editForm.out_time || null,
        status: editForm.status || null,
      });
      setDays((prev) => ({ ...prev, [rec.date]: updated }));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
        <div>
          <h3 className="font-semibold text-gray-800">{emp.name}</h3>
          <p className="text-xs text-gray-400">#{emp.code}</p>
        </div>
      </div>

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
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dateList.map((d) => {
              const rec = days[d];
              const isEditing = rec && editingId === rec.id;
              const statusStyle = rec ? (STATUS_STYLE[rec.status] || "bg-gray-50 text-gray-500") : "";
              const isPresent = rec && rec.status !== "A" && rec.status !== "WO";

              if (isEditing) {
                return (
                  <tr key={d} className="bg-indigo-50">
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      {new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
                        weekday: "short", day: "numeric", month: "short",
                      })}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                        className="border border-gray-300 rounded px-1 py-0.5 text-xs w-20"
                      >
                        {["P", "A", "WO", "WOP"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="time"
                        value={editForm.in_time}
                        onChange={(e) => setEditForm((f) => ({ ...f, in_time: e.target.value }))}
                        className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="time"
                        value={editForm.out_time}
                        onChange={(e) => setEditForm((f) => ({ ...f, out_time: e.target.value }))}
                        className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                      />
                    </td>
                    <td className="px-4 py-2 text-center text-gray-400 text-xs">—</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => saveEdit(rec)}
                        disabled={saving}
                        className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded mr-1 disabled:opacity-50"
                      >
                        {saving ? "…" : "Save"}
                      </button>
                      <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-300">
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={d} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                    {new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {rec ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>
                        {rec.status}
                      </span>
                    ) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-center font-medium ${rec?.in_time ? "text-gray-800" : isPresent ? "text-red-400 italic" : "text-gray-400"}`}>
                    {rec ? (rec.in_time ? fmt(rec.in_time) : isPresent ? "Missing" : "—") : "—"}
                  </td>
                  <td className={`px-4 py-2 text-center font-medium ${rec?.out_time ? "text-gray-800" : isPresent ? "text-red-400 italic" : "text-gray-400"}`}>
                    {rec ? (rec.out_time ? fmt(rec.out_time) : isPresent ? "Missing" : "—") : "—"}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-600">{rec ? fmtDuration(rec.duration_minutes) : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {rec && (
                      <button
                        onClick={() => startEdit(rec)}
                        className="text-xs text-indigo-500 hover:text-indigo-700"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
