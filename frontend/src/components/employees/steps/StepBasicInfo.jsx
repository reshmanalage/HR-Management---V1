import PhotoUpload from "../PhotoUpload";

const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const selectCls = inputCls;

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function StepBasicInfo({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value || null });

  return (
    <div className="space-y-6">
      {/* Photo */}
      <div className="flex justify-center">
        <PhotoUpload
          value={data.photo_url}
          onChange={({ photo_url, photo_drive_file_id }) =>
            onChange({ ...data, photo_url, photo_drive_file_id })
          }
        />
      </div>

      {/* Name row */}
      <div className="grid grid-cols-3 gap-4">
        <Field label="First Name *">
          <input
            className={inputCls}
            value={data.first_name ?? ""}
            onChange={set("first_name")}
            placeholder="First name"
          />
        </Field>
        <Field label="Middle Name">
          <input
            className={inputCls}
            value={data.middle_name ?? ""}
            onChange={set("middle_name")}
            placeholder="Middle name"
          />
        </Field>
        <Field label="Last Name *">
          <input
            className={inputCls}
            value={data.last_name ?? ""}
            onChange={set("last_name")}
            placeholder="Last name"
          />
        </Field>
      </div>

      <Field label="Display Name" hint="If blank, will show as First + Last name">
        <input
          className={inputCls}
          value={data.display_name ?? ""}
          onChange={set("display_name")}
          placeholder="e.g. Reshma N."
        />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Gender">
          <select className={selectCls} value={data.gender ?? ""} onChange={set("gender")}>
            <option value="">— Select —</option>
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
          />
        </Field>
        <Field label="Blood Group">
          <select className={selectCls} value={data.blood_group ?? ""} onChange={set("blood_group")}>
            <option value="">— Select —</option>
            {["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].map((bg) => (
              <option key={bg} value={bg}>{bg}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Marital Status">
          <select className={selectCls} value={data.marital_status ?? ""} onChange={set("marital_status")}>
            <option value="">— Select —</option>
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
