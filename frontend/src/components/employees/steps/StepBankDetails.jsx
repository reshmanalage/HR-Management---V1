const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function BankRow({ account, index, onChange, onRemove, onSetPrimary }) {
  const set = (field) => (e) => onChange(index, { ...account, [field]: e.target.value || null });

  return (
    <div className={`border rounded-lg p-4 space-y-4 relative ${account.is_primary ? "border-indigo-400 bg-indigo-50/30" : "border-gray-200"}`}>
      {account.is_primary && (
        <span className="absolute top-3 right-10 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
          Primary
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-lg leading-none"
        title="Remove"
      >
        ×
      </button>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bank Name *</label>
          <input className={inputCls} value={account.bank_name ?? ""} onChange={set("bank_name")} placeholder="e.g. HDFC Bank" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Number *</label>
          <input className={inputCls} value={account.account_number ?? ""} onChange={set("account_number")} placeholder="Account number" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">IFSC Code *</label>
          <input
            className={`${inputCls} uppercase`}
            value={account.ifsc_code ?? ""}
            onChange={(e) => onChange(index, { ...account, ifsc_code: e.target.value.toUpperCase() || null })}
            placeholder="HDFC0001234"
            maxLength={11}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Branch Name</label>
          <input className={inputCls} value={account.branch_name ?? ""} onChange={set("branch_name")} placeholder="Bank branch" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Holder Name *</label>
          <input className={inputCls} value={account.account_holder_name ?? ""} onChange={set("account_holder_name")} placeholder="As per bank records" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Type</label>
          <select className={inputCls} value={account.account_type ?? "savings"} onChange={set("account_type")}>
            <option value="savings">Savings</option>
            <option value="current">Current</option>
            <option value="salary">Salary Account</option>
          </select>
        </div>
      </div>

      {!account.is_primary && (
        <button
          type="button"
          onClick={() => onSetPrimary(index)}
          className="text-xs text-indigo-600 hover:underline"
        >
          Set as primary account
        </button>
      )}
    </div>
  );
}

export default function StepBankDetails({ data, onChange }) {
  const accounts = data.bank_accounts ?? [];

  function add() {
    const newAcct = { bank_name: "", account_number: "", ifsc_code: "", account_holder_name: "", account_type: "savings", is_primary: accounts.length === 0 };
    onChange({ ...data, bank_accounts: [...accounts, newAcct] });
  }

  function update(index, updated) {
    onChange({ ...data, bank_accounts: accounts.map((a, i) => (i === index ? updated : a)) });
  }

  function remove(index) {
    const next = accounts.filter((_, i) => i !== index);
    // If removed was primary and there's another, make first one primary
    if (accounts[index].is_primary && next.length > 0) next[0].is_primary = true;
    onChange({ ...data, bank_accounts: next });
  }

  function setPrimary(index) {
    onChange({
      ...data,
      bank_accounts: accounts.map((a, i) => ({ ...a, is_primary: i === index })),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Add bank account(s) for salary disbursement. Mark one as primary.</p>
        <button
          type="button"
          onClick={add}
          className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-md hover:bg-indigo-100"
        >
          + Add Account
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No bank accounts added. Click "+ Add Account" to add one.
        </div>
      )}

      {accounts.map((acct, i) => (
        <BankRow key={i} account={acct} index={i} onChange={update} onRemove={remove} onSetPrimary={setPrimary} />
      ))}
    </div>
  );
}
