import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createEmployee, getEmployee, updateEmployee } from "../../services/employeeService";
import StepBasicInfo from "../../components/employees/steps/StepBasicInfo";
import StepEmployment from "../../components/employees/steps/StepEmployment";
import StepContact from "../../components/employees/steps/StepContact";
import StepDocuments from "../../components/employees/steps/StepDocuments";
import StepBankDetails from "../../components/employees/steps/StepBankDetails";
import StepStatutory from "../../components/employees/steps/StepStatutory";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  {
    label: "Basic Info",
    short: "1",
    description: "Enter the employee's personal and identity information.",
  },
  {
    label: "Employment",
    short: "2",
    description: "Set employment type, department, designation, and joining details.",
  },
  {
    label: "Contact",
    short: "3",
    description: "Add contact details and residential addresses.",
  },
  {
    label: "Documents",
    short: "4",
    description: "Upload identity proofs and education certificates. You can add more later.",
  },
  {
    label: "Bank Details",
    short: "5",
    description: "Add bank account(s) for salary disbursement.",
  },
  {
    label: "Statutory",
    short: "6",
    description: "PF, ESIC, PAN, Aadhaar, and KYC details for compliance.",
  },
];

const DRAFT_KEY = "emp_form_draft";

const EMPTY = {
  first_name: "", middle_name: null, last_name: "", display_name: null,
  gender: null, date_of_birth: null, blood_group: null, marital_status: null,
  nationality: null, religion: null, photo_url: null, photo_drive_file_id: null,
  biometric_code: null, date_of_joining: null, confirmation_date: null,
  employment_type: null, employee_status: "active", employee_category: null,
  payment_mode: null, department_id: null, designation_id: null,
  reporting_manager_id: null, branch: null, location: null, grade: null,
  shift: null, shift_id: null, cost_center: null, ctc: null,
  personal_email: null, company_email: null, mobile_number: null, alternate_mobile: null,
  addresses: [], documents: [], bank_accounts: [], statutory: null,
};

// ─── Validation ────────────────────────────────────────────────────────────────

function validateStep(step, data) {
  if (step === 0) {
    if (!data.first_name?.trim()) return "First name is required.";
    if (!data.last_name?.trim()) return "Last name is required.";
  }
  if (step === 1) {
    if (!data.date_of_joining) return "Date of joining is required.";
  }
  return null;
}

// ─── SVG helpers ───────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function StepIndicator({ current, visited, stepErrors, total }) {
  return (
    <>
      {/* Desktop stepper */}
      <div className="hidden md:flex items-center mb-8">
        {STEPS.map((step, i) => {
          const isDone  = visited.has(i) && i !== current && !stepErrors[i];
          const isError = visited.has(i) && i !== current && !!stepErrors[i];
          const isActive = i === current;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200
                    ${isDone  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200" :
                      isError ? "bg-red-500 text-white" :
                      isActive ? "bg-indigo-600 text-white ring-4 ring-indigo-100" :
                      "bg-white text-gray-400 border border-gray-200"}`}
                >
                  {isDone ? <CheckIcon /> : isError ? "!" : step.short}
                </div>
                <span
                  className={`text-[11px] mt-1.5 font-semibold whitespace-nowrap
                    ${isActive ? "text-indigo-700" : isError ? "text-red-500" : "text-gray-400"}`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-5 transition-colors duration-200 ${i < current ? "bg-indigo-600" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: progress bar */}
      <div className="md:hidden mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-indigo-700">
            Step {current + 1} of {total} — {STEPS[current].label}
          </span>
          <span className="text-xs font-medium text-gray-400">
            {Math.round(((current + 1) / total) * 100)}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${((current + 1) / total) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}

// ─── Draft banner ─────────────────────────────────────────────────────────────

function DraftBanner({ onRestore, onDiscard }) {
  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="font-medium">You have an unsaved draft.</span>
        <span className="text-amber-600">Resume where you left off?</span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="text-xs bg-amber-600 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-amber-700 transition-colors"
        >
          Restore Draft
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FormSkeleton() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded-lg mb-6" />
      <div className="flex gap-2 mb-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <div className="h-2 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 space-y-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-16 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EmployeeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [step, setStep]           = useState(0);
  const [formData, setFormData]   = useState(EMPTY);
  const [employeeCode, setEmployeeCode] = useState(null);
  const [loading, setLoading]     = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState(null);
  const [visited, setVisited]     = useState(new Set([0]));
  const [stepErrors, setStepErrors] = useState({});
  const [showDraft, setShowDraft]   = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const formRef = useRef(null);

  // Check for existing draft on mount
  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.first_name || parsed.last_name || parsed.date_of_joining) {
          setSavedDraft(parsed);
          setShowDraft(true);
        }
      }
    } catch { /* ignore */ }
  }, [isEdit]);

  // Auto-save draft on every change
  useEffect(() => {
    if (isEdit) return;
    const hasContent = formData.first_name || formData.last_name || formData.date_of_joining;
    if (hasContent) {
      const timer = setTimeout(() => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData, isEdit]);

  // Load employee for edit
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
        employee_category: emp.employee_category ?? null,
        payment_mode: emp.payment_mode ?? null,
        department_id: emp.department?.id ?? null,
        designation_id: emp.designation?.id ?? null,
        reporting_manager_id: emp.reporting_manager?.id ?? null,
        branch: emp.branch ?? null,
        location: emp.location ?? null,
        grade: emp.grade ?? null,
        shift: emp.shift ?? null,
        shift_id: emp.shift_id ?? null,
        cost_center: emp.cost_center ?? null,
        ctc: emp.ctc ?? null,
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
    }).catch(() => setLoading(false));
  }, [id, isEdit]);

  function handleRestoreDraft() {
    if (savedDraft) {
      setFormData(savedDraft);
      setShowDraft(false);
    }
  }

  function handleDiscardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setSavedDraft(null);
    setShowDraft(false);
  }

  function handleNext() {
    const err = validateStep(step, formData);
    const newErrors = { ...stepErrors };
    if (err) {
      newErrors[step] = err;
      setStepErrors(newErrors);
      setError(err);
      return;
    }
    delete newErrors[step];
    setStepErrors(newErrors);
    setError(null);
    const next = step + 1;
    setStep(next);
    setVisited((v) => new Set([...v, next]));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleBack() {
    setError(null);
    setStep((s) => s - 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSaveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
  }

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
      employee_category: d.employee_category || null,
      payment_mode: d.payment_mode || null,
      department_id: d.department_id || null,
      designation_id: d.designation_id || null,
      reporting_manager_id: d.reporting_manager_id || null,
      branch: d.branch || null,
      location: d.location || null,
      grade: d.grade || null,
      shift: d.shift || null,
      shift_id: d.shift_id || null,
      cost_center: d.cost_center || null,
      ctc: d.ctc || null,
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
    // Validate current (last) step
    const err = validateStep(step, formData);
    if (err) { setError(err); return; }

    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateEmployee(Number(id), payload);
      } else {
        await createEmployee(payload);
        localStorage.removeItem(DRAFT_KEY);
      }
      navigate("/employees");
    } catch (err) {
      setError(err.response?.data?.detail ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepComponents = [
    <StepBasicInfo   data={formData} onChange={setFormData} />,
    <StepEmployment  data={formData} onChange={setFormData} employeeCode={employeeCode} />,
    <StepContact     data={formData} onChange={setFormData} />,
    <StepDocuments   data={formData} onChange={setFormData} />,
    <StepBankDetails data={formData} onChange={setFormData} />,
    <StepStatutory   data={formData} onChange={setFormData} />,
  ];

  if (loading) return <FormSkeleton />;

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="max-w-3xl pb-4" ref={formRef}>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-7">
        <button
          onClick={() => navigate("/employees")}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
          aria-label="Back to employees"
        >
          <ChevronLeft />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 leading-tight">
            {isEdit ? `Edit Employee` : "Add New Employee"}
          </h1>
          {isEdit && employeeCode && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{employeeCode}</p>
          )}
        </div>
        {!isEdit && (
          <button
            type="button"
            onClick={handleSaveDraft}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Draft
          </button>
        )}
      </div>

      {/* Draft restore banner */}
      {showDraft && !isEdit && (
        <DraftBanner onRestore={handleRestoreDraft} onDiscard={handleDiscardDraft} />
      )}

      {/* Stepper */}
      <StepIndicator
        current={step}
        visited={visited}
        stepErrors={stepErrors}
        total={STEPS.length}
      />

      {/* Step card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        {/* Card header */}
        <div className="px-7 pt-6 pb-5 border-b border-gray-100">
          <p className="text-[10px] font-bold tracking-widest uppercase text-indigo-500 mb-1">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-base font-semibold text-gray-900">{STEPS[step].label}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{STEPS[step].description}</p>
        </div>

        {/* Step content */}
        <div className="px-7 py-6">
          {stepComponents[step]}
        </div>
      </div>

      {/* Inline error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
          <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] -mx-6 px-6 py-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft /> Previous
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/employees")}
            className="px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm shadow-indigo-200"
            >
              Next <ChevronRight />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm shadow-indigo-200"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                isEdit ? "Save Changes" : "Add Employee"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
