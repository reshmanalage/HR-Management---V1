import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { listEmployees, deactivateEmployee, promoteProbationEmployees } from "../../services/employeeService";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-indigo-500","bg-violet-500","bg-pink-500","bg-rose-500","bg-orange-500",
  "bg-amber-500","bg-teal-500","bg-cyan-500","bg-sky-500","bg-emerald-500",
];
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

const EMP_TYPE_LABELS = {
  permanent: "Permanent", probation: "Probation", contract: "Contract",
  intern: "Intern", part_time: "Part-Time", consultant: "Consultant",
};
const EMP_CATEGORY_LABELS = {
  office_staff: "Office Staff", worker: "Worker", management: "Management",
  security: "Security", housekeeping: "Housekeeping",
};
const STATUS_CONFIG = {
  active:        { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",  label: "Active"        },
  probation:     { dot: "bg-amber-400",   pill: "bg-amber-50 text-amber-700 ring-amber-200",        label: "Probation"     },
  notice_period: { dot: "bg-orange-400",  pill: "bg-orange-50 text-orange-700 ring-orange-200",     label: "Notice Period" },
  inactive:      { dot: "bg-slate-300",   pill: "bg-slate-100 text-slate-500 ring-slate-200",       label: "Inactive"      },
  terminated:    { dot: "bg-red-400",     pill: "bg-red-50 text-red-600 ring-red-200",              label: "Terminated"    },
};
const STATUS_ORDER = { active: 1, probation: 2, notice_period: 3, inactive: 4, terminated: 5 };

// ─────────────────────────────────────────────────────────────────────────────
// Sorting utilities
// ─────────────────────────────────────────────────────────────────────────────
const COLUMN_DEFS = {
  name:            { getValue: e => `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(), type: "text"    },
  code:            { getValue: e => e.employee_code ?? "",                                type: "code"    },
  department:      { getValue: e => e.department?.name ?? "",                             type: "text"    },
  designation:     { getValue: e => e.designation?.title ?? "",                           type: "text"    },
  category:        { getValue: e => EMP_CATEGORY_LABELS[e.employee_category] ?? "",       type: "text"    },
  employment_type: { getValue: e => EMP_TYPE_LABELS[e.employment_type] ?? "",             type: "text"    },
  mobile:          { getValue: e => e.mobile_number ?? "",                                type: "numeric" },
  joined:          { getValue: e => e.date_of_joining ?? "",                              type: "date"    },
  status:          { getValue: e => e.employee_status ?? "",                              type: "status"  },
};

function compareValues(a, b, type) {
  const aEmpty = a === "" || a == null;
  const bEmpty = b === "" || b == null;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  switch (type) {
    case "code":    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    case "numeric": return Number(String(a).replace(/\D/g, "") || 0) - Number(String(b).replace(/\D/g, "") || 0);
    case "date":    return new Date(a) - new Date(b);
    case "status":  return (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99);
    default:        return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
}

function sortData(data, field, direction) {
  if (!field || !direction) return data;
  const { getValue, type } = COLUMN_DEFS[field];
  return [...data].sort((a, b) => {
    const cmp = compareValues(getValue(a), getValue(b), type);
    return direction === "asc" ? cmp : -cmp;
  });
}

// Tri-state cycle: null → asc → desc → null
function useSort() {
  const [field, setField]         = useState(null);
  const [direction, setDirection] = useState(null);
  const toggle = useCallback((col) => {
    setDirection(prev => {
      if (col !== field || prev === null) { setField(col); return "asc"; }
      if (prev === "asc")                { return "desc"; }
      setField(null); return null;
    });
  }, [field]);
  return { sortField: field, sortDirection: direction, handleSort: toggle };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export helper
// ─────────────────────────────────────────────────────────────────────────────
function exportCSV(emps) {
  const headers = ["Name","Code","Email","Department","Designation","Category","Type","Mobile","Joined","Status"];
  const rows = emps.map(e => [
    `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
    e.employee_code ?? "",
    e.company_email ?? "",
    e.department?.name ?? "",
    e.designation?.title ?? "",
    EMP_CATEGORY_LABELS[e.employee_category] ?? "",
    EMP_TYPE_LABELS[e.employment_type] ?? "",
    e.mobile_number ?? "",
    e.date_of_joining ?? "",
    STATUS_CONFIG[e.employee_status]?.label ?? "",
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: "employees.csv",
  });
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar helpers
// ─────────────────────────────────────────────────────────────────────────────
function avatarColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(f, l) { return ((f?.[0] ?? "") + (l?.[0] ?? "")).toUpperCase() || "?"; }

// ─────────────────────────────────────────────────────────────────────────────
// SortIcon
// ─────────────────────────────────────────────────────────────────────────────
function SortIcon({ active, direction }) {
  if (!active) return (
    <svg className="w-3 h-3 ml-1 opacity-25 group-hover/th:opacity-50 transition-opacity" viewBox="0 0 10 14" fill="currentColor">
      <path d="M5 0L9 5H1L5 0Z" />
      <path d="M5 14L1 9H9L5 14Z" />
    </svg>
  );
  return direction === "asc"
    ? <svg className="w-3 h-3 ml-1 text-indigo-500" viewBox="0 0 10 7" fill="currentColor"><path d="M5 0L10 7H0L5 0Z" /></svg>
    : <svg className="w-3 h-3 ml-1 text-indigo-500" viewBox="0 0 10 7" fill="currentColor"><path d="M5 7L0 0H10L5 7Z" /></svg>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SortableHeader
// ─────────────────────────────────────────────────────────────────────────────
function SortableHeader({ field, label, sortField, sortDirection, onSort, align = "left", className = "" }) {
  const isActive = sortField === field;
  return (
    <th
      aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 text-${align} whitespace-nowrap ${className}`}
    >
      <button
        onClick={() => onSort(field)}
        className={`group/th inline-flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-widest select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:rounded ${
          isActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        {label}
        <SortIcon active={isActive} direction={sortDirection} />
      </button>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IndeterminateCheckbox
// ─────────────────────────────────────────────────────────────────────────────
function IndeterminateCheckbox({ indeterminate, ...props }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 cursor-pointer focus:ring-indigo-500 focus:ring-offset-0"
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterChip
// ─────────────────────────────────────────────────────────────────────────────
function FilterChip({ label, value, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
      <span className="text-indigo-400 font-normal">{label}:</span>
      {value}
      <button
        onClick={onRemove}
        className="ml-0.5 hover:text-indigo-900 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BulkActionBar
// ─────────────────────────────────────────────────────────────────────────────
function BulkActionBar({ count, onExport, onDeactivate, onClear }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-600 rounded-lg text-white text-sm shadow-md">
      <span className="font-semibold">{count} selected</span>
      <div className="w-px h-4 bg-indigo-400" />
      <button
        onClick={onExport}
        className="flex items-center gap-1.5 text-indigo-100 hover:text-white transition-colors text-xs font-medium"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export CSV
      </button>
      <button
        onClick={onDeactivate}
        className="flex items-center gap-1.5 text-red-200 hover:text-white transition-colors text-xs font-medium"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        Deactivate
      </button>
      <button
        onClick={onClear}
        className="ml-auto text-indigo-200 hover:text-white transition-colors"
        aria-label="Clear selection"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RowActionMenu  (three-dot, portal-rendered to avoid overflow clipping)
// ─────────────────────────────────────────────────────────────────────────────
function RowActionMenu({ emp, empName, onClose, position, onDeactivate }) {
  const nav = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    {
      label: "View Profile",
      icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
      onClick: () => { nav(`/employees/${emp.id}`); onClose(); },
    },
    {
      label: "Edit",
      icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
      onClick: () => { nav(`/employees/${emp.id}/edit`); onClose(); },
    },
    { divider: true },
    {
      label: "Deactivate",
      icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
      danger: true,
      onClick: () => { onDeactivate(emp.id, empName); onClose(); },
    },
  ];

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: position.top, left: position.left, zIndex: 9999, minWidth: 168 }}
      className="bg-white rounded-xl border border-slate-200 shadow-lg py-1 text-sm"
      onClick={e => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 border-t border-slate-100" />
        ) : (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
              item.danger
                ? "text-red-500 hover:bg-red-50"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────
function getPageNums(current, total) {
  const set = new Set(
    [1, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total)
  );
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

function Pagination({ page, totalPages, rowsPerPage, totalRows, startRow, endRow, onPage, onRowsPerPage }) {
  if (totalPages <= 1 && totalRows <= ROWS_PER_PAGE_OPTIONS[0]) return null;
  return (
    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4 flex-wrap">
      {/* Left: showing X–Y of Z */}
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{startRow}–{endRow}</span> of{" "}
        <span className="font-medium text-slate-700">{totalRows}</span> employees
      </p>

      {/* Centre: page numbers */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <PgBtn onClick={() => onPage(page - 1)} disabled={page === 1} label="Prev">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </PgBtn>
          {getPageNums(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
              <PgBtn key={n} onClick={() => onPage(n)} active={page === n}>{n}</PgBtn>
            )
          )}
          <PgBtn onClick={() => onPage(page + 1)} disabled={page === totalPages} label="Next">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </PgBtn>
        </div>
      )}

      {/* Right: rows per page */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Rows per page</span>
        <select
          value={rowsPerPage}
          onChange={e => onRowsPerPage(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {ROWS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

function PgBtn({ onClick, disabled, active, children, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonRow
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4 w-10"><div className="w-4 h-4 bg-slate-100 rounded" /></td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
          <div><div className="h-3.5 bg-slate-100 rounded w-32 mb-1.5" /><div className="h-2.5 bg-slate-100 rounded w-20" /></div>
        </div>
      </td>
      {[112, 96, 80, 72, 80].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-3.5 bg-slate-100 rounded" style={{ width: w }} />
          {i === 0 && <div className="h-2.5 bg-slate-100 rounded w-16 mt-1.5" />}
        </td>
      ))}
      <td className="px-4 py-4 w-10" />
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ hasFilters, onClear }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700 mb-1">
        {hasFilters ? "No employees match your filters" : "No employees yet"}
      </p>
      <p className="text-xs text-slate-400 mb-4">
        {hasFilters ? "Try adjusting your search or clearing filters." : "Add your first employee to get started."}
      </p>
      {hasFilters && (
        <button onClick={onClear} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
          Clear all filters
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatChip
// ─────────────────────────────────────────────────────────────────────────────
function StatChip({ label, value, accent }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 bg-white rounded-lg border border-slate-200">
      <span className={`text-base font-semibold tabular-nums ${accent ?? "text-slate-800"}`}>{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared input class
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white";

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeListPage
// ─────────────────────────────────────────────────────────────────────────────
export default function EmployeeListPage() {
  // ── data & filters ─────────────────────────────────────────────────────────
  const [employees, setEmployees]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [filterDept, setFilterDept]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // ── sorting ─────────────────────────────────────────────────────────────────
  const { sortField, sortDirection, handleSort } = useSort();

  // ── pagination ──────────────────────────────────────────────────────────────
  const [page, setPage]               = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // ── bulk selection ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── row action menu ─────────────────────────────────────────────────────────
  const [menuState, setMenuState] = useState(null); // { emp, empName, top, left }

  // ── load ────────────────────────────────────────────────────────────────────
  async function load() {
    try {
      promoteProbationEmployees().catch(() => {});
      setEmployees(await listEmployees());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Reset page when filters / sort change
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [search, filterDept, filterStatus, sortField, sortDirection]);

  // ── deactivate ──────────────────────────────────────────────────────────────
  async function handleDeactivate(id, name) {
    if (!confirm(`Deactivate ${name}?`)) return;
    await deactivateEmployee(id);
    setEmployees(prev => prev.filter(e => e.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function handleBulkDeactivate() {
    const ids = [...selectedIds];
    if (!confirm(`Deactivate ${ids.length} employee(s)?`)) return;
    await Promise.all(ids.map(id => deactivateEmployee(id)));
    setEmployees(prev => prev.filter(e => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
  }

  // ── derived data (pipeline: original → filter → sort → paginate) ────────────
  const departments = useMemo(
    () => [...new Set(employees.map(e => e.department?.name).filter(Boolean))].sort(),
    [employees]
  );

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = employees.filter(e => {
      const matchSearch = !q
        || e.first_name.toLowerCase().includes(q)
        || e.last_name.toLowerCase().includes(q)
        || e.employee_code.toLowerCase().includes(q)
        || (e.company_email ?? "").toLowerCase().includes(q)
        || (e.mobile_number ?? "").includes(q)
        || (e.department?.name ?? "").toLowerCase().includes(q);
      const matchDept   = !filterDept   || e.department?.name === filterDept;
      const matchStatus = !filterStatus || e.employee_status  === filterStatus;
      return matchSearch && matchDept && matchStatus;
    });
    return sortData(filtered, sortField, sortDirection);
  }, [employees, search, filterDept, filterStatus, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / rowsPerPage));
  const safePage   = Math.min(page, totalPages);
  const startIdx   = (safePage - 1) * rowsPerPage;
  const pageRows   = filteredSorted.slice(startIdx, startIdx + rowsPerPage);
  const startRow   = filteredSorted.length === 0 ? 0 : startIdx + 1;
  const endRow     = Math.min(startIdx + rowsPerPage, filteredSorted.length);

  const counts = useMemo(() => ({
    total:     employees.length,
    active:    employees.filter(e => e.employee_status === "active").length,
    probation: employees.filter(e => e.employee_status === "probation").length,
    notice:    employees.filter(e => e.employee_status === "notice_period").length,
  }), [employees]);

  // ── selection helpers ────────────────────────────────────────────────────────
  const pageIds         = pageRows.map(e => e.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const someSelected    = pageIds.some(id => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => n.delete(id));
      else                 pageIds.forEach(id => n.add(id));
      return n;
    });
  }

  function toggleRow(id) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── menu helpers ─────────────────────────────────────────────────────────────
  function openMenu(e, emp, empName) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({ emp, empName, top: rect.bottom + 6, left: rect.right - 168 });
  }

  // ── derived booleans ─────────────────────────────────────────────────────────
  const hasFilters   = !!(search || filterDept || filterStatus);
  const clearFilters = () => { setSearch(""); setFilterDept(""); setFilterStatus(""); };
  const sortProps    = { sortField, sortDirection, onSort: handleSort };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-800 tracking-tight">Employees</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your workforce directory</p>
        </div>
        <Link
          to="/employees/new"
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </Link>
      </div>

      {/* Stat chips */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          <StatChip label="Total"         value={counts.total}     accent="text-slate-800" />
          <StatChip label="Active"        value={counts.active}    accent="text-emerald-600" />
          <StatChip label="On Probation"  value={counts.probation} accent="text-amber-600" />
          <StatChip label="Notice Period" value={counts.notice}    accent="text-orange-600" />
        </div>
      )}

      {/* Search + filter controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search name, code, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputCls + " pl-9 w-64"}
          />
        </div>

        <select value={filterDept}   onChange={e => setFilterDept(e.target.value)}   className={inputCls}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>

        {!loading && hasFilters && (
          <span className="ml-auto text-xs text-slate-400">
            {filteredSorted.length} of {employees.length} employees
          </span>
        )}
      </div>

      {/* Active filter chips */}
      {(filterDept || filterStatus) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterDept && (
            <FilterChip label="Department" value={filterDept} onRemove={() => setFilterDept("")} />
          )}
          {filterStatus && (
            <FilterChip
              label="Status"
              value={STATUS_CONFIG[filterStatus]?.label ?? filterStatus}
              onRemove={() => setFilterStatus("")}
            />
          )}
          <button
            onClick={clearFilters}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onExport={() => exportCSV(employees.filter(e => selectedIds.has(e.id)))}
          onDeactivate={handleBulkDeactivate}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200">
                {/* Select all */}
                <th className="px-4 py-3 w-10">
                  <IndeterminateCheckbox
                    checked={allPageSelected}
                    indeterminate={!allPageSelected && someSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all on this page"
                  />
                </th>
                <SortableHeader field="name"            label="Employee"  {...sortProps} className="px-5 min-w-[200px]" />
                {/* Dept / Role — two separate sortable sub-headers */}
                <th className="px-4 py-3 text-left whitespace-nowrap min-w-[180px]">
                  <div className="inline-flex items-center gap-1.5">
                    <SortableHeader field="department"  label="Dept"     {...sortProps} className="px-0 py-0" />
                    <span className="text-slate-200">/</span>
                    <SortableHeader field="designation" label="Role"     {...sortProps} className="px-0 py-0" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left whitespace-nowrap min-w-[160px]">
                  <div className="inline-flex items-center gap-1.5">
                    <SortableHeader field="category"        label="Category" {...sortProps} className="px-0 py-0" />
                    <span className="text-slate-200">/</span>
                    <SortableHeader field="employment_type" label="Type"     {...sortProps} className="px-0 py-0" />
                  </div>
                </th>
                <SortableHeader field="mobile" label="Mobile"  {...sortProps} className="min-w-[120px]" />
                <SortableHeader field="joined" label="Joined"  {...sortProps} className="min-w-[110px]" />
                <SortableHeader field="status" label="Status"  {...sortProps} className="min-w-[120px]" />
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : pageRows.length === 0
                ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
                    </td>
                  </tr>
                )
                : pageRows.map(emp => {
                    const name      = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ");
                    const status    = STATUS_CONFIG[emp.employee_status];
                    const isChecked = selectedIds.has(emp.id);

                    return (
                      <tr
                        key={emp.id}
                        className={`group cursor-pointer transition-colors ${isChecked ? "bg-indigo-50/60" : "hover:bg-slate-50"}`}
                        onClick={() => (window.location.href = `/employees/${emp.id}`)}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3.5 w-10" onClick={e => { e.stopPropagation(); toggleRow(emp.id); }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(emp.id)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 cursor-pointer focus:ring-indigo-500"
                          />
                        </td>

                        {/* Employee */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {emp.photo_url ? (
                              <img src={emp.photo_url} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-slate-100" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[11px] font-bold ${avatarColor(name)}`}>
                                {initials(emp.first_name, emp.last_name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate leading-snug">{name}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{emp.employee_code}</p>
                            </div>
                          </div>
                        </td>

                        {/* Dept / Role */}
                        <td className="px-4 py-3.5">
                          <p className="text-slate-700 font-medium text-[13px] leading-snug">
                            {emp.department?.name ?? <span className="text-slate-300 font-normal">Not Assigned</span>}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {emp.designation?.title ?? ""}
                          </p>
                        </td>

                        {/* Category / Type */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1">
                            {emp.employee_category ? (
                              <span className="inline-flex self-start px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                                {EMP_CATEGORY_LABELS[emp.employee_category] ?? emp.employee_category}
                              </span>
                            ) : null}
                            {emp.employment_type ? (
                              <span className="inline-flex self-start px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500">
                                {EMP_TYPE_LABELS[emp.employment_type] ?? emp.employment_type}
                              </span>
                            ) : null}
                            {!emp.employee_category && !emp.employment_type && (
                              <span className="text-[12px] text-slate-300">Not Set</span>
                            )}
                          </div>
                        </td>

                        {/* Mobile */}
                        <td className="px-4 py-3.5 text-[13px] tabular-nums">
                          {emp.mobile_number
                            ? <span className="text-slate-600">{emp.mobile_number}</span>
                            : <span className="text-slate-300 text-[12px]">No Mobile</span>}
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3.5 text-[12px] tabular-nums">
                          {emp.date_of_joining
                            ? <span className="text-slate-500">{new Date(emp.date_of_joining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                            : <span className="text-slate-300">Not Set</span>}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          {status ? (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 ${status.pill}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
                              {status.label}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[12px]">Unknown</span>
                          )}
                        </td>

                        {/* Three-dot action menu */}
                        <td className="px-4 py-3.5 w-10" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={e => openMenu(e, emp, name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                            aria-label="Row actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="5"  cy="12" r="1.5" />
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="19" cy="12" r="1.5" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && filteredSorted.length > 0 && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            rowsPerPage={rowsPerPage}
            totalRows={filteredSorted.length}
            startRow={startRow}
            endRow={endRow}
            onPage={setPage}
            onRowsPerPage={n => { setRowsPerPage(n); setPage(1); }}
          />
        )}
      </div>

      {/* Row action menu portal */}
      {menuState && (
        <RowActionMenu
          emp={menuState.emp}
          empName={menuState.empName}
          position={{ top: menuState.top, left: menuState.left }}
          onClose={() => setMenuState(null)}
          onDeactivate={handleDeactivate}
        />
      )}
    </div>
  );
}
