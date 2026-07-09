const inputCls = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";
const labelCls = "block text-[11px] font-semibold tracking-wide uppercase text-gray-500 mb-1.5";

function Field({ label, children, hint }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
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

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={`w-10 h-5 rounded-full transition-colors duration-200 ${checked ? "bg-indigo-600" : "bg-gray-200 group-hover:bg-gray-300"}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : ""}`} />
      </div>
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {hint && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{hint}</p>}
      </div>
    </label>
  );
}

export default function StepStatutory({ data, onChange }) {
  const stat = data.statutory ?? {};

  function set(field) {
    return (e) => onChange({ ...data, statutory: { ...stat, [field]: e.target.value || null } });
  }

  function toggle(field) {
    return (val) => onChange({ ...data, statutory: { ...stat, [field]: val } });
  }

  return (
    <div className="space-y-6">
      {/* PF */}
      <SectionDivider title="Provident Fund (PF / EPF)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="UAN Number" hint="12-digit Universal Account Number.">
          <input className={inputCls} value={stat.uan_number ?? ""} onChange={set("uan_number")} placeholder="123456789012" maxLength={12} />
        </Field>
        <Field label="PF Member ID" hint="e.g. MH/BAN/1234567/000/0000001">
          <input className={inputCls} value={stat.pf_member_id ?? ""} onChange={set("pf_member_id")} placeholder="MH/BAN/…" />
        </Field>
        <Field label="PF Joining Date">
          <input type="date" className={inputCls} value={stat.pf_joining_date ?? ""} onChange={set("pf_joining_date")} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
        <Toggle label="PF Eligible"   checked={stat.pf_eligible   ?? true}  onChange={toggle("pf_eligible")} />
        <Toggle label="VPF (Voluntary PF)" checked={stat.vpf_eligible ?? false} onChange={toggle("vpf_eligible")} />
        <Toggle label="EPS Eligible"  checked={stat.eps_eligible  ?? true}  onChange={toggle("eps_eligible")}  hint="Employee Pension Scheme" />
        <Toggle label="EDLI Eligible" checked={stat.edli_eligible ?? true}  onChange={toggle("edli_eligible")} hint="Employees' Deposit Linked Insurance" />
      </div>

      {/* ESIC */}
      <SectionDivider title="ESIC" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ESIC IP Number" hint="17-digit Insurance Person number.">
          <input className={inputCls} value={stat.esic_ip_number ?? ""} onChange={set("esic_ip_number")} placeholder="1234567890123456" />
        </Field>
        <Field label="ESIC Joining Date">
          <input type="date" className={inputCls} value={stat.esic_joining_date ?? ""} onChange={set("esic_joining_date")} />
        </Field>
        <Field label="ESIC Dispensary">
          <input className={inputCls} value={stat.esic_dispensary ?? ""} onChange={set("esic_dispensary")} placeholder="Dispensary name / code" />
        </Field>
      </div>
      <Toggle label="ESIC Eligible" checked={stat.esic_eligible ?? true} onChange={toggle("esic_eligible")} />

      {/* Tax & Identity */}
      <SectionDivider title="Tax & Identity" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="PAN Number" hint="10-character PAN — e.g. ABCDE1234F.">
          <input
            className={`${inputCls} tracking-wider`}
            value={stat.pan_number ?? ""}
            onChange={(e) => onChange({ ...data, statutory: { ...stat, pan_number: e.target.value.toUpperCase() || null } })}
            placeholder="ABCDE1234F"
            maxLength={10}
          />
        </Field>
        <Field label="Aadhaar Number" hint="12-digit unique identity number.">
          <input className={inputCls} value={stat.aadhaar_number ?? ""} onChange={set("aadhaar_number")} placeholder="1234 5678 9012" maxLength={14} />
        </Field>
        <Field label="Professional Tax State">
          <input className={inputCls} value={stat.pt_state ?? ""} onChange={set("pt_state")} placeholder="e.g. Maharashtra" />
        </Field>
      </div>

      {/* KYC */}
      <SectionDivider title="KYC Status" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
        <Toggle label="Aadhaar Linked with UAN" checked={stat.aadhaar_linked ?? false} onChange={toggle("aadhaar_linked")} />
        <Toggle label="PAN Linked with UAN"     checked={stat.pan_linked     ?? false} onChange={toggle("pan_linked")} />
        <Toggle label="Bank Account Verified"   checked={stat.bank_verified  ?? false} onChange={toggle("bank_verified")} />
        <Toggle label="UAN Activated"           checked={stat.uan_activated  ?? false} onChange={toggle("uan_activated")} />
        <Toggle label="KYC Verified"            checked={stat.kyc_verified   ?? false} onChange={toggle("kyc_verified")} hint="Overall KYC completion status" />
      </div>
    </div>
  );
}
