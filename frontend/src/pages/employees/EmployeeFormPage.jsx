import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createEmployee, getEmployee, updateEmployee } from "../../services/employeeService";
import StepBasicInfo from "../../components/employees/steps/StepBasicInfo";
import StepEmployment from "../../components/employees/steps/StepEmployment";
import StepContact from "../../components/employees/steps/StepContact";
import StepDocuments from "../../components/employees/steps/StepDocuments";
import StepBankDetails from "../../components/employees/steps/StepBankDetails";
import StepStatutory from "../../components/employees/steps/StepStatutory";

const STEPS = [
  { label: "Basic Info",    short: "1" },
  { label: "Employment",   short: "2" },
  { label: "Contact",      short: "3" },
  { label: "Documents",    short: "4" },
  { label: "Bank Details", short: "5" },
  { label: "Statutory",    short: "6" },
];

const EMPTY = {
  // step 1
  first_name: "", middle_name: null, last_name: "", display_name: null,
  gender: null, date_of_birth: null, blood_group: null, marital_status: null,
  nationality: null, religion: null, photo_url: null, photo_drive_file_id: null,
  // step 2
  biometric_code: null, date_of_joining: null, confirmation_date: null,
  employment_type: null, employee_status: "active",
  department_id: null, designation_id: null, reporting_manager_id: null,
  branch: null, location: null, grade: null, shift: null, cost_center: null,
  // step 3
  personal_email: null, company_email: null, mobile_number: null, alternate_mobile: null,
  addresses: [],
  // step 4
  documents: [],
  // step 5
  bank_accounts: [],
  // step 6
  statutory: null,
};

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
                ${i < current ? "bg-indigo-600 text-white" :
                  i === current ? "bg-indigo-600 text-white ring-4 ring-indigo-100" :
                  "bg-gray-200 text-gray-500"}`}
            >
              {i < current ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : step.short}
            </div>
            <span className={`text-xs mt-1 whitespace-nowrap ${i === current ? "text-indigo-700 font-medium" : "text-gray-400"}`}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-5 ${i < current ? "bg-indigo-600" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState(EMPTY);
  const [employeeCode, setEmployeeCode] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    getEmployee(Number(id)).then((emp) => {
      setEmployeeCode(emp.employee_code);
      setFormData({
        first_name: emp.first_name ?? "",
        middle_name: emp.middle_name ?? null,
        last_name: emp.last_name ?? "",
        display_name: emp.display_name ?? null,
        gender: emp.gender ?? null,
        date_of_birth: emp.date_of_birth ?? null,
        blood_group: emp.blood_group ?? null,
        marital_status: emp.marital_status ?? null,
        nationality: emp.nationality ?? null,
        religion: emp.religion ?? null,
        photo_url: emp.photo_url ?? null,
        photo_drive_file_id: null,

        biometric_code: emp.biometric_code ?? null,
        date_of_joining: emp.date_of_joining ?? null,
        confirmation_date: emp.confirmation_date ?? null,
        employment_type: emp.employment_type ?? null,
        employee_status: emp.employee_status ?? "active",
        department_id: emp.department?.id ?? null,
        designation_id: emp.designation?.id ?? null,
        reporting_manager_id: emp.reporting_manager?.id ?? null,
        branch: emp.branch ?? null,
        location: emp.location ?? null,
        grade: emp.grade ?? null,
        shift: emp.shift ?? null,
        cost_center: emp.cost_center ?? null,

        personal_email: emp.personal_email ?? null,
        company_email: emp.company_email ?? null,
        mobile_number: emp.mobile_number ?? null,
        alternate_mobile: emp.alternate_mobile ?? null,
        addresses: emp.addresses ?? [],

        documents: emp.documents ?? [],
        bank_accounts: emp.bank_accounts ?? [],
        statutory: emp.statutory ?? null,
      });
      setLoading(false);
    });
  }, [id, isEdit]);

  function buildPayload() {
    const d = formData;
    return {
      first_name: d.first_name,
      middle_name: d.middle_name || null,
      last_name: d.last_name,
      display_name: d.display_name || null,
      gender: d.gender || null,
      date_of_birth: d.date_of_birth || null,
      blood_group: d.blood_group || null,
      marital_status: d.marital_status || null,
      nationality: d.nationality || null,
      religion: d.religion || null,
      photo_url: d.photo_url || null,
      photo_drive_file_id: d.photo_drive_file_id || null,

      biometric_code: d.biometric_code || null,
      date_of_joining: d.date_of_joining || null,
      confirmation_date: d.confirmation_date || null,
      employment_type: d.employment_type || null,
      employee_status: d.employee_status || "active",
      department_id: d.department_id || null,
      designation_id: d.designation_id || null,
      reporting_manager_id: d.reporting_manager_id || null,
      branch: d.branch || null,
      location: d.location || null,
      grade: d.grade || null,
      shift: d.shift || null,
      cost_center: d.cost_center || null,

      personal_email: d.personal_email || null,
      company_email: d.company_email || null,
      mobile_number: d.mobile_number || null,
      alternate_mobile: d.alternate_mobile || null,

      addresses: (d.addresses ?? []).filter((a) => a.address_line_1 || a.city),
      bank_accounts: (d.bank_accounts ?? []).filter((b) => b.bank_name && b.account_number),
      statutory: d.statutory ? { ...d.statutory } : null,
    };
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateEmployee(Number(id), payload);
      } else {
        await createEmployee(payload);
      }
      navigate("/employees");
    } catch (err) {
      setError(err.response?.data?.detail ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepComponents = [
    <StepBasicInfo data={formData} onChange={setFormData} />,
    <StepEmployment data={formData} onChange={setFormData} employeeCode={employeeCode} />,
    <StepContact data={formData} onChange={setFormData} />,
    <StepDocuments data={formData} onChange={setFormData} />,
    <StepBankDetails data={formData} onChange={setFormData} />,
    <StepStatutory data={formData} onChange={setFormData} />,
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">Loading employee data…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/employees")} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">
          {isEdit ? `Edit Employee — ${employeeCode}` : "Add New Employee"}
        </h1>
      </div>

      <StepIndicator current={step} total={STEPS.length} />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-6">{STEPS[step].label}</h2>
        {stepComponents[step]}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="px-5 py-2 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate("/employees")}
            className="px-5 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
