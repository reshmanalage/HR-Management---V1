import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deactivateEmployee, getEmployee } from "../../services/employeeService";

const PLACEHOLDER = "https://ui-avatars.com/api/?background=6366f1&color=fff&size=200&name=";

const STATUS_STYLES = {
  active:        "bg-green-100 text-green-700",
  probation:     "bg-yellow-100 text-yellow-700",
  notice_period: "bg-orange-100 text-orange-700",
  inactive:      "bg-gray-100 text-gray-500",
  terminated:    "bg-red-100 text-red-600",
};

const STATUS_LABELS = {
  active: "Active", probation: "Probation", notice_period: "Notice Period",
  inactive: "Inactive", terminated: "Terminated",
};

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800 mt-0.5">{value}</span>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function OverviewTab({ emp }) {
  const fullName = (v) => v ?? "—";

  return (
    <div className="space-y-4">
      <SectionCard title="Personal Information">
        <InfoRow label="Full Name" value={`${emp.first_name}${emp.middle_name ? " " + emp.middle_name : ""} ${emp.last_name}`} />
        <InfoRow label="Display Name" value={emp.display_name} />
        <InfoRow label="Gender" value={emp.gender ? emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1) : null} />
        <InfoRow label="Date of Birth" value={emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString("en-IN") : null} />
        <InfoRow label="Blood Group" value={emp.blood_group} />
        <InfoRow label="Marital Status" value={emp.marital_status} />
        <InfoRow label="Nationality" value={emp.nationality} />
        <InfoRow label="Religion" value={emp.religion} />
      </SectionCard>

      <SectionCard title="Contact Information">
        <InfoRow label="Personal Email" value={emp.personal_email} />
        <InfoRow label="Company Email" value={emp.company_email} />
        <InfoRow label="Mobile" value={emp.mobile_number} />
        <InfoRow label="Alternate Mobile" value={emp.alternate_mobile} />
      </SectionCard>

      {emp.addresses?.length > 0 && (
        <SectionCard title="Addresses">
          {emp.addresses.map((addr, i) => (
            <div key={i} className="col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{addr.address_type} Address</span>
              <p className="text-sm text-gray-800 mt-0.5">
                {[addr.address_line_1, addr.address_line_2, addr.landmark, addr.city, addr.district, addr.state, addr.postal_code, addr.country]
                  .filter(Boolean).join(", ")}
              </p>
            </div>
          ))}
        </SectionCard>
      )}

      <SectionCard title="Employment Details">
        <InfoRow label="Employee Code" value={emp.employee_code} />
        <InfoRow label="Biometric Code" value={emp.biometric_code} />
        <InfoRow label="Employment Type" value={emp.employment_type} />
        <InfoRow label="Grade" value={emp.grade} />
        <InfoRow label="Date of Joining" value={emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString("en-IN") : null} />
        <InfoRow label="Confirmation Date" value={emp.confirmation_date ? new Date(emp.confirmation_date).toLocaleDateString("en-IN") : null} />
        <InfoRow label="Branch" value={emp.branch} />
        <InfoRow label="Location" value={emp.location} />
        <InfoRow label="Shift" value={emp.shift} />
        <InfoRow label="Cost Center" value={emp.cost_center} />
      </SectionCard>
    </div>
  );
}

function DocumentsTab({ emp }) {
  const docs = emp.documents ?? [];
  if (docs.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">No documents uploaded.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-100">
      <table className="min-w-full text-sm divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Number</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Expiry</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Verified</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {docs.map((doc) => (
            <tr key={doc.id}>
              <td className="px-4 py-3 font-medium text-gray-800">
                {doc.document_label || doc.document_type}
              </td>
              <td className="px-4 py-3 text-gray-600">{doc.document_number || "—"}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString("en-IN") : "—"}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${doc.is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {doc.is_verified ? "Verified" : "Pending"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                    View
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankTab({ emp }) {
  const accounts = emp.bank_accounts ?? [];
  if (accounts.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">No bank accounts added.</p>;
  }
  return (
    <div className="space-y-3">
      {accounts.map((acct) => (
        <div key={acct.id} className={`border rounded-lg p-4 ${acct.is_primary ? "border-indigo-300 bg-indigo-50/30" : "border-gray-100"}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-gray-800">{acct.bank_name}</span>
            {acct.is_primary && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Primary</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <InfoRow label="Account Number" value={acct.account_number} />
            <InfoRow label="IFSC Code" value={acct.ifsc_code} />
            <InfoRow label="Branch" value={acct.branch_name} />
            <InfoRow label="Account Holder" value={acct.account_holder_name} />
            <InfoRow label="Account Type" value={acct.account_type} />
            <InfoRow label="Verified" value={acct.is_verified ? "Yes" : "No"} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatutoryTab({ emp }) {
  const s = emp.statutory;
  if (!s) return <p className="text-sm text-gray-400 py-6 text-center">No statutory information added.</p>;

  function KycBadge({ label, value }) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${value ? "bg-green-500" : "bg-gray-300"}`} />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="PF / EPF">
        <InfoRow label="UAN Number" value={s.uan_number} />
        <InfoRow label="PF Member ID" value={s.pf_member_id} />
        <InfoRow label="PF Joining Date" value={s.pf_joining_date ? new Date(s.pf_joining_date).toLocaleDateString("en-IN") : null} />
        <InfoRow label="PF Eligible" value={s.pf_eligible ? "Yes" : "No"} />
        <InfoRow label="VPF Eligible" value={s.vpf_eligible ? "Yes" : "No"} />
        <InfoRow label="EPS Eligible" value={s.eps_eligible ? "Yes" : "No"} />
        <InfoRow label="EDLI Eligible" value={s.edli_eligible ? "Yes" : "No"} />
      </SectionCard>

      <SectionCard title="ESIC">
        <InfoRow label="ESIC IP Number" value={s.esic_ip_number} />
        <InfoRow label="ESIC Eligible" value={s.esic_eligible ? "Yes" : "No"} />
        <InfoRow label="Joining Date" value={s.esic_joining_date ? new Date(s.esic_joining_date).toLocaleDateString("en-IN") : null} />
        <InfoRow label="Dispensary" value={s.esic_dispensary} />
      </SectionCard>

      <SectionCard title="Tax & Identity">
        <InfoRow label="PAN Number" value={s.pan_number} />
        <InfoRow label="Aadhaar Number" value={s.aadhaar_number ? `XXXX XXXX ${s.aadhaar_number.slice(-4)}` : null} />
        <InfoRow label="PT State" value={s.pt_state} />
      </SectionCard>

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">KYC Status</h3>
        <div className="grid grid-cols-2 gap-2">
          <KycBadge label="Aadhaar Linked" value={s.aadhaar_linked} />
          <KycBadge label="PAN Linked" value={s.pan_linked} />
          <KycBadge label="Bank Verified" value={s.bank_verified} />
          <KycBadge label="UAN Activated" value={s.uan_activated} />
          <KycBadge label="KYC Verified" value={s.kyc_verified} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",   label: "Overview" },
  { key: "documents",  label: "Documents" },
  { key: "bank",       label: "Bank Details" },
  { key: "statutory",  label: "Statutory" },
];

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    getEmployee(Number(id)).then(setEmp);
  }, [id]);

  async function handleDeactivate() {
    if (!confirm(`Deactivate ${emp.first_name} ${emp.last_name}?`)) return;
    await deactivateEmployee(emp.id);
    navigate("/employees");
  }

  if (!emp) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  const avatarUrl = emp.photo_url || `${PLACEHOLDER}${encodeURIComponent(emp.first_name + "+" + emp.last_name)}`;

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link to="/employees" className="hover:text-gray-600">Employees</Link>
        <span>/</span>
        <span className="text-gray-700">{emp.first_name} {emp.last_name}</span>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="w-60 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col items-center text-center">
            <img
              src={avatarUrl}
              alt={`${emp.first_name} ${emp.last_name}`}
              className="w-24 h-24 rounded-full object-cover bg-indigo-100 mb-3"
              onError={(e) => { e.target.src = `${PLACEHOLDER}${encodeURIComponent(emp.first_name + "+" + emp.last_name)}`; }}
            />
            <h2 className="font-semibold text-gray-900 text-base">
              {emp.display_name || `${emp.first_name} ${emp.last_name}`}
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{emp.employee_code}</p>

            <span className={`mt-2 inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[emp.employee_status] ?? "bg-gray-100 text-gray-500"}`}>
              {STATUS_LABELS[emp.employee_status] ?? emp.employee_status}
            </span>

            <div className="mt-4 w-full text-left space-y-2 text-xs text-gray-500 border-t border-gray-100 pt-4">
              {emp.department && <p><span className="font-medium text-gray-600">Dept:</span> {emp.department.name}</p>}
              {emp.designation && <p><span className="font-medium text-gray-600">Title:</span> {emp.designation.title}</p>}
              {emp.date_of_joining && (
                <p><span className="font-medium text-gray-600">Joined:</span> {new Date(emp.date_of_joining).toLocaleDateString("en-IN")}</p>
              )}
              {emp.reporting_manager && (
                <p><span className="font-medium text-gray-600">Manager:</span> {emp.reporting_manager.first_name} {emp.reporting_manager.last_name}</p>
              )}
              {emp.mobile_number && <p><span className="font-medium text-gray-600">Mobile:</span> {emp.mobile_number}</p>}
            </div>

            <div className="mt-5 w-full space-y-2">
              <Link
                to={`/employees/${emp.id}/edit`}
                className="block w-full text-center text-sm border border-indigo-300 text-indigo-700 rounded-md py-1.5 hover:bg-indigo-50"
              >
                Edit Profile
              </Link>
              <button
                onClick={handleDeactivate}
                className="block w-full text-center text-sm border border-red-200 text-red-600 rounded-md py-1.5 hover:bg-red-50"
              >
                Deactivate
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 mb-5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div>
            {activeTab === "overview"  && <OverviewTab emp={emp} />}
            {activeTab === "documents" && <DocumentsTab emp={emp} />}
            {activeTab === "bank"      && <BankTab emp={emp} />}
            {activeTab === "statutory" && <StatutoryTab emp={emp} />}
          </div>
        </div>
      </div>
    </div>
  );
}
