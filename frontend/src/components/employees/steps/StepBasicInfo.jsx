import PhotoUpload from "../PhotoUpload";

const inputCls  = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";
const selectCls = inputCls;
const labelCls  = "block text-[11px] font-semibold tracking-wide uppercase text-gray-500 mb-1.5";

function Field({ label, required, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function SectionDivider({ title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

export default function StepBasicInfo({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value || null });

  return (
    <div className="space-y-5">
      {/* Identity — photo anchored left, name fields to the right */}
      <div className="flex gap-5 items-start">
        <div className="flex flex-col items-center pt-1">
          <PhotoUpload
            value={data.photo_url}
            onChange={({ photo_url, photo_drive_file_id }) =>
              onChange({ ...data, photo_url, photo_drive_file_id })
            }
          />
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First Name" required>
            <input
              className={inputCls}
              value={data.first_name ?? ""}
              onChange={set("first_name")}
              placeholder="First name"
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last Name" required>
            <input
              className={inputCls}
              value={data.last_name ?? ""}
              onChange={set("last_name")}
              placeholder="Last name"
              autoComplete="family-name"
            />
          </Field>
          <Field label="Middle Name">
            <input
              className={inputCls}
              value={data.middle_name ?? ""}
              onChange={set("middle_name")}
              placeholder="Middle name"
              autoComplete="additional-name"
            />
          </Field>
          <Field label="Display Name" hint="Shown on badge & reports. Auto-fills as First + Last if blank.">
            <input
              className={inputCls}
              value={data.display_name ?? ""}
              onChange={set("display_name")}
              placeholder="e.g. Reshma N."
            />
          </Field>
        </div>
      </div>

      <SectionDivider title="Personal Details" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Gender">
          <select className={selectCls} value={data.gender ?? ""} onChange={set("gender")}>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date of Birth">
          <input
            type="date"
            className={inputCls}
            value={data.date_of_birth ?? ""}
            onChange={set("date_of_birth")}
            autoComplete="bday"
          />
        </Field>
        <Field label="Blood Group">
          <select className={selectCls} value={data.blood_group ?? ""} onChange={set("blood_group")}>
            <option value="">Select…</option>
            {["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].map((bg) => (
              <option key={bg} value={bg}>{bg}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Marital Status">
          <select className={selectCls} value={data.marital_status ?? ""} onChange={set("marital_status")}>
            <option value="">Select…</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Nationality">
          <input
            className={inputCls}
            value={data.nationality ?? ""}
            onChange={set("nationality")}
            placeholder="e.g. Indian"
          />
        </Field>
        <Field label="Religion">
          <input
            className={inputCls}
            value={data.religion ?? ""}
            onChange={set("religion")}
            placeholder="e.g. Hindu"
          />
        </Field>
      </div>
    </div>
  );
}
