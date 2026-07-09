const inputCls = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";
const labelCls = "block text-[11px] font-semibold tracking-wide uppercase text-gray-500 mb-1.5";

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function BankRow({ account, index, onChange, onRemove, onSetPrimary }) {
  const set = (field) => (e) => onChange(index, { ...account, [field]: e.target.value || null });

  return (
    <div className={`border rounded-xl p-5 space-y-4 relative ${account.is_primary ? "border-indigo-300 bg-indigo-50/40" : "border-gray-200 bg-white"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${account.is_primary ? "bg-indigo-500" : "bg-gray-300"}`} />
          <span className="text-sm font-semibold text-gray-700">
            {account.bank_name || `Account ${index + 1}`}
          </span>
          {account.is_primary && (
            <span className="text-[10px] font-bold tracking-wide uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              Primary
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Remove account"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Bank Name" required>
          <input className={inputCls} value={account.bank_name ?? ""} onChange={set("bank_name")} placeholder="e.g. HDFC Bank" />
        </Field>
        <Field label="Account Number" required>
          <input className={inputCls} value={account.account_number ?? ""} onChange={set("account_number")} placeholder="Account number" />
        </Field>
        <Field label="IFSC Code" required>
          <input
            className={`${inputCls} tracking-wider`}
            value={account.ifsc_code ?? ""}
            onChange={(e) => onChange(index, { ...account, ifsc_code: e.target.value.toUpperCase() || null })}
            placeholder="HDFC0001234"
            maxLength={11}
          />
        </Field>
        <Field label="Branch Name">
          <input className={inputCls} value={account.branch_name ?? ""} onChange={set("branch_name")} placeholder="Bank branch" />
        </Field>
        <Field label="Account Holder Name" required>
          <input className={inputCls} value={account.account_holder_name ?? ""} onChange={set("account_holder_name")} placeholder="As per bank records" />
        </Field>
        <Field label="Account Type">
          <select className={inputCls} value={account.account_type ?? "savings"} onChange={set("account_type")}>
            <option value="savings">Savings</option>
            <option value="current">Current</option>
            <option value="salary">Salary Account</option>
          </select>
        </Field>
      </div>

      {!account.is_primary && (
        <button
          type="button"
          onClick={() => onSetPrimary(index)}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Set as primary account
        </button>
      )}
    </div>
  );
}

export default function StepBankDetails({ data, onChange }) {
  const accounts = data.bank_accounts ?? [];

  function add() {
    const newAcct = {
      bank_name: "", account_number: "", ifsc_code: "",
      account_holder_name: "", account_type: "savings",
      is_primary: accounts.length === 0,
    };
    onChange({ ...data, bank_accounts: [...accounts, newAcct] });
  }

  function update(index, updated) {
    onChange({ ...data, bank_accounts: accounts.map((a, i) => (i === index ? updated : a)) });
  }

  function remove(index) {
    const next = accounts.filter((_, i) => i !== index);
    if (accounts[index].is_primary && next.length > 0) next[0].is_primary = true;
    onChange({ ...data, bank_accounts: next });
  }

  function setPrimary(index) {
    onChange({ ...data, bank_accounts: accounts.map((a, i) => ({ ...a, is_primary: i === index })) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Add bank account(s) for salary disbursement. Mark one as primary.</p>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3.5 py-2 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
      </div>

      {accounts.length === 0 && (
        <button
          type="button"
          onClick={add}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm hover:border-indigo-300 hover:text-indigo-500 transition-colors"
        >
          <svg className="mx-auto w-8 h-8 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          Click to add a bank account
        </button>
      )}

      {accounts.map((acct, i) => (
        <BankRow key={i} account={acct} index={i} onChange={update} onRemove={remove} onSetPrimary={setPrimary} />
      ))}
    </div>
  );
}
