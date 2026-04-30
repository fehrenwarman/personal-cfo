import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { callClaude, buildFinancialContext } from '../lib/claude'
import { Save, Sparkles, Plus, Trash2, Pencil, Check, X } from 'lucide-react'

const ACCOUNT_TYPES = [
  { value: 'chequing', label: 'Chequing', color: '#74b9ff', asset: true },
  { value: 'savings', label: 'Savings', color: '#55efc4', asset: true },
  { value: 'credit', label: 'Credit Card', color: '#ff6b6b', asset: false },
  { value: 'loc', label: 'Line of Credit', color: '#fd79a8', asset: false },
  { value: 'other_bank', label: 'Other', color: '#888', asset: true },
]

const INVESTMENT_FIELDS = [
  { key: 'tfsa_balance', label: 'TFSA Balance', group: 'tfsa' },
  { key: 'tfsa_room', label: 'TFSA Contribution Room', group: 'tfsa' },
  { key: 'rrsp_balance', label: 'RRSP Balance', group: 'rrsp' },
  { key: 'rrsp_room', label: 'RRSP Contribution Room', group: 'rrsp' },
  { key: 'resp_balance', label: 'RESP Balance', group: 'resp' },
  { key: 'resp_room', label: 'RESP Contribution Room', group: 'resp' },
  { key: 'non_registered', label: 'Non-Registered Investing', group: 'other' },
  { key: 'savings_cad', label: 'Savings (CAD)', group: 'other' },
  { key: 'savings_usd', label: 'Savings (USD)', group: 'other' },
]

function newBankAccount() {
  return { id: crypto.randomUUID(), name: '', type: 'chequing', balance: 0, currency: 'CAD' }
}

export default function Accounts() {
  const { accounts, saveAccounts, profile, transactions, settings, usdCadRate } = useApp()
  const [form, setForm] = useState({})
  const [bankAccounts, setBankAccounts] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [strategy, setStrategy] = useState(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyError, setStrategyError] = useState(null)

  useEffect(() => {
    if (accounts) {
      setForm(accounts)
      setBankAccounts(accounts.bank_accounts || [])
    }
  }, [accounts])

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: parseFloat(value) || 0 }))
  }

  function addBankAccount() {
    const acct = newBankAccount()
    setBankAccounts(prev => [...prev, acct])
    setEditingId(acct.id)
  }

  function updateBankAccount(id, field, value) {
    setBankAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  function removeBankAccount(id) {
    setBankAccounts(prev => prev.filter(a => a.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const err = await saveAccounts({ ...form, bank_accounts: bankAccounts })
    setSaving(false)
    if (err) {
      setSaveError(err)
    } else {
      setSaved(true)
      setEditingId(null)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function generateStrategy() {
    if (!settings?.api_key) {
      setStrategyError('Add your Anthropic API key in Settings to use this feature.')
      return
    }
    setStrategyLoading(true)
    setStrategyError(null)
    setStrategy(null)
    try {
      const context = buildFinancialContext({ profile, accounts: { ...form, bank_accounts: bankAccounts }, transactions, usdCadRate })
      const estimatedRrspRoom = Math.min(
        Math.round(((profile?.annual_income_cad || 0) + (profile?.annual_income_usd || 0) * usdCadRate) * 0.18),
        32490
      )
      const text = await callClaude({
        apiKey: settings.api_key,
        system: `You are a personal CFO for a Canadian. Give specific, actionable advice. Be warm but direct. Lead with the big picture. Use numbers. Avoid bullet points unless listing 4 or more items. Never use em dashes. Limit your response to 400 words.`,
        messages: [{
          role: 'user',
          content: `Based on my financial profile below, give me a specific allocation strategy covering: TFSA vs RRSP vs RESP vs non-registered investing, USD timing advice, and ${profile?.province || 'BC'}-specific tax considerations. Estimated new RRSP room this year: $${estimatedRrspRoom.toLocaleString()}.\n\n${context}`,
        }],
        maxTokens: 700,
      })
      setStrategy(text)
    } catch (err) {
      setStrategyError(err.message)
    } finally {
      setStrategyLoading(false)
    }
  }

  const totalIncome = (profile?.annual_income_cad || 0) + (profile?.annual_income_usd || 0) * usdCadRate
  const estimatedRrspRoom = Math.min(Math.round(totalIncome * 0.18), 32490)
  const kidsCount = profile?.has_kids && profile?.kids_ages?.length ? profile.kids_ages.length : 0

  // Net worth calc
  const bankAssets = bankAccounts
    .filter(a => ACCOUNT_TYPES.find(t => t.value === a.type)?.asset)
    .reduce((s, a) => s + (a.currency === 'USD' ? (a.balance || 0) * usdCadRate : (a.balance || 0)), 0)
  const bankLiabilities = bankAccounts
    .filter(a => !ACCOUNT_TYPES.find(t => t.value === a.type)?.asset)
    .reduce((s, a) => s + Math.abs(a.currency === 'USD' ? (a.balance || 0) * usdCadRate : (a.balance || 0)), 0)
  const investmentTotal =
    (form.tfsa_balance || 0) + (form.rrsp_balance || 0) + (form.resp_balance || 0) +
    (form.non_registered || 0) + (form.savings_cad || 0) + (form.savings_usd || 0) * usdCadRate
  const netWorth = bankAssets + investmentTotal - bankLiabilities

  const fmtCAD = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Accounts</h2>
        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
          <Save size={13} />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {saveError && (
        <div style={styles.saveError}>
          Save failed: {saveError}. Check your Supabase connection and that the SQL setup was run.
        </div>
      )}

      <div style={styles.layout}>
        <div style={styles.leftCol}>

          {/* Bank & Credit Accounts */}
          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.groupLabel}>Bank & Credit Accounts</div>
                <div style={styles.sectionSub}>Chequing, savings, credit cards, lines of credit</div>
              </div>
              <button onClick={addBankAccount} style={styles.addBtn}>
                <Plus size={13} />
                Add Account
              </button>
            </div>

            {bankAccounts.length === 0 ? (
              <div style={styles.emptyBank}>No accounts yet. Add your chequing, savings, and credit cards.</div>
            ) : (
              <div style={styles.bankList}>
                {bankAccounts.map(acct => {
                  const typeInfo = ACCOUNT_TYPES.find(t => t.value === acct.type) || ACCOUNT_TYPES[4]
                  const isEditing = editingId === acct.id
                  const balanceCAD = acct.currency === 'USD' ? (acct.balance || 0) * usdCadRate : (acct.balance || 0)

                  return (
                    <div key={acct.id} style={styles.bankRow}>
                      {isEditing ? (
                        <div style={styles.editRow}>
                          <input
                            autoFocus
                            value={acct.name}
                            onChange={e => updateBankAccount(acct.id, 'name', e.target.value)}
                            placeholder="Account name (e.g. TD Chequing)"
                            style={styles.editInput}
                          />
                          <select
                            value={acct.type}
                            onChange={e => updateBankAccount(acct.id, 'type', e.target.value)}
                            style={styles.editSelect}
                          >
                            {ACCOUNT_TYPES.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <select
                            value={acct.currency}
                            onChange={e => updateBankAccount(acct.id, 'currency', e.target.value)}
                            style={{ ...styles.editSelect, width: '80px' }}
                          >
                            <option value="CAD">CAD</option>
                            <option value="USD">USD</option>
                          </select>
                          <input
                            type="number"
                            value={acct.balance}
                            onChange={e => updateBankAccount(acct.id, 'balance', parseFloat(e.target.value) || 0)}
                            placeholder="Balance"
                            style={{ ...styles.editInput, width: '130px', textAlign: 'right' }}
                          />
                          <button onClick={() => setEditingId(null)} style={styles.iconBtn}>
                            <Check size={14} color="#c8f264" />
                          </button>
                          <button onClick={() => removeBankAccount(acct.id)} style={styles.iconBtn}>
                            <Trash2 size={14} color="#ff6b6b" />
                          </button>
                        </div>
                      ) : (
                        <div style={styles.viewRow}>
                          <div style={styles.bankLeft}>
                            <span style={{ ...styles.typeDot, background: typeInfo.color }} />
                            <div>
                              <div style={styles.bankName}>{acct.name || 'Unnamed account'}</div>
                              <div style={styles.bankType}>{typeInfo.label}{acct.currency === 'USD' ? ' · USD' : ''}</div>
                            </div>
                          </div>
                          <div style={styles.bankRight}>
                            <div style={{
                              ...styles.bankBalance,
                              color: typeInfo.asset ? '#e8e8e8' : '#ff6b6b',
                            }}>
                              {typeInfo.asset ? '' : '-'}{fmtCAD(Math.abs(balanceCAD))}
                            </div>
                            {acct.currency === 'USD' && (
                              <div style={styles.bankSub}>${Math.abs(acct.balance || 0).toLocaleString()} USD</div>
                            )}
                          </div>
                          <button onClick={() => setEditingId(acct.id)} style={styles.iconBtn}>
                            <Pencil size={13} color="#555" />
                          </button>
                          <button onClick={() => removeBankAccount(acct.id)} style={styles.iconBtn}>
                            <X size={13} color="#555" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Bank summary */}
            {bankAccounts.length > 0 && (
              <div style={styles.bankSummary}>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryLabel}>Assets</span>
                  <span style={styles.summaryValue}>{fmtCAD(bankAssets)}</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryLabel}>Liabilities</span>
                  <span style={{ ...styles.summaryValue, color: '#ff6b6b' }}>-{fmtCAD(bankLiabilities)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Investment Accounts */}
          <div style={styles.card}>
            <div style={styles.groupLabel} style={{ marginBottom: '16px' }}>Investment Accounts</div>
            {['tfsa', 'rrsp', 'resp', 'other'].map(group => {
              const fields = INVESTMENT_FIELDS.filter(f => f.group === group)
              const groupLabels = { tfsa: 'TFSA', rrsp: 'RRSP', resp: 'RESP', other: 'Other' }
              return (
                <div key={group} style={styles.fieldGroup}>
                  <div style={styles.groupLabel}>{groupLabels[group]}</div>
                  {fields.map(({ key, label }) => (
                    <div key={key} style={styles.field}>
                      <label style={styles.label}>{label}</label>
                      <div style={styles.inputWrap}>
                        <span style={styles.inputPrefix}>{key === 'savings_usd' ? 'USD' : '$'}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form[key] ?? 0}
                          onChange={e => handleChange(key, e.target.value)}
                          style={styles.input}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column: info + strategy */}
        <div style={styles.infoColumn}>

          {/* Net Worth summary */}
          <div style={styles.networthCard}>
            <div style={styles.networthLabel}>Total Net Worth</div>
            <div style={{ ...styles.networthValue, color: netWorth >= 0 ? '#c8f264' : '#ff6b6b' }}>
              {fmtCAD(netWorth)}
            </div>
            <div style={styles.networthBreakdown}>
              <span style={{ color: '#888' }}>Bank {fmtCAD(bankAssets - bankLiabilities)}</span>
              <span style={{ color: '#555' }}>+</span>
              <span style={{ color: '#888' }}>Investments {fmtCAD(investmentTotal)}</span>
            </div>
          </div>

          <div style={styles.infoCard}>
            <h3 style={styles.infoTitle}>2025 Limits & Info</h3>
            <InfoRow label="TFSA annual limit" value="$7,000" />
            <InfoRow
              label="Est. new RRSP room"
              value={`$${estimatedRrspRoom.toLocaleString()}`}
              sub="18% of income, max $32,490"
            />
            <InfoRow
              label="RESP CESG per child"
              value={kidsCount > 0 ? `$${(500 * kidsCount).toLocaleString()}/yr` : '$500/yr per child'}
              sub="20% of first $2,500 contributed"
            />
            <InfoRow label="Live USD/CAD" value={usdCadRate.toFixed(4)} />
            {form.savings_usd > 0 && (
              <InfoRow
                label="USD savings in CAD"
                value={`$${Math.round((form.savings_usd || 0) * usdCadRate).toLocaleString()}`}
                sub={`${(form.savings_usd || 0).toLocaleString()} USD`}
              />
            )}
          </div>

          <button onClick={generateStrategy} disabled={strategyLoading} style={styles.strategyBtn}>
            <Sparkles size={14} />
            {strategyLoading ? 'Generating...' : 'Generate Strategy'}
          </button>

          {strategyError && <div style={styles.errorBox}>{strategyError}</div>}

          {strategy && (
            <div style={styles.strategyBox}>
              <div style={styles.strategyHeader}>Allocation Strategy</div>
              <p style={styles.strategyText}>{strategy}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, sub }) {
  return (
    <div style={styles.infoRow}>
      <div style={styles.infoLabel}>{label}</div>
      <div>
        <div style={styles.infoValue}>{value}</div>
        {sub && <div style={styles.infoSub}>{sub}</div>}
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8' },
  saveBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 16px', background: '#c8f264',
    border: 'none', borderRadius: '8px',
    color: '#0f0f0f', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  layout: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' },
  leftCol: { display: 'flex', flexDirection: 'column', gap: '20px' },
  card: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px',
  },
  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px',
  },
  sectionSub: { fontSize: '12px', color: '#555', marginTop: '4px' },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '7px 13px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#888', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  emptyBank: { fontSize: '13px', color: '#555', textAlign: 'center', padding: '24px 0' },
  bankList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  bankRow: {
    borderRadius: '8px', overflow: 'hidden',
  },
  viewRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px', background: '#1a1a1a', borderRadius: '8px',
  },
  editRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px', background: '#1e1e1e', borderRadius: '8px', flexWrap: 'wrap',
  },
  bankLeft: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1 },
  typeDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  bankName: { fontSize: '13px', color: '#e8e8e8' },
  bankType: { fontSize: '11px', color: '#555', marginTop: '2px' },
  bankRight: { textAlign: 'right', marginRight: '4px' },
  bankBalance: { fontSize: '14px', fontWeight: 500 },
  bankSub: { fontSize: '11px', color: '#555' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
    display: 'flex', alignItems: 'center', borderRadius: '4px',
  },
  editInput: {
    flex: 1, padding: '7px 10px', background: '#2a2a2a',
    border: '1px solid #333', borderRadius: '6px',
    color: '#e8e8e8', fontSize: '13px', outline: 'none', minWidth: '0',
  },
  editSelect: {
    padding: '7px 10px', background: '#2a2a2a',
    border: '1px solid #333', borderRadius: '6px',
    color: '#888', fontSize: '13px', outline: 'none', cursor: 'pointer',
  },
  bankSummary: {
    marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a2a',
    display: 'flex', gap: '24px',
  },
  summaryRow: { display: 'flex', flexDirection: 'column', gap: '2px' },
  summaryLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryValue: { fontSize: '16px', fontFamily: "'DM Serif Display', Georgia, serif", color: '#e8e8e8' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  groupLabel: {
    fontSize: '11px', color: '#555', textTransform: 'uppercase',
    letterSpacing: '0.08em', paddingBottom: '8px', borderBottom: '1px solid #2a2a2a', marginBottom: '4px',
  },
  field: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  label: { fontSize: '13px', color: '#888', flex: 1 },
  inputWrap: {
    display: 'flex', alignItems: 'center', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '8px', overflow: 'hidden',
  },
  inputPrefix: {
    padding: '8px 10px', fontSize: '11px', color: '#555',
    borderRight: '1px solid #2a2a2a', background: '#1a1a1a',
  },
  input: {
    padding: '8px 12px', background: 'transparent', border: 'none',
    color: '#e8e8e8', fontSize: '14px', outline: 'none', width: '140px', textAlign: 'right',
  },
  infoColumn: { display: 'flex', flexDirection: 'column', gap: '16px' },
  networthCard: {
    background: 'rgba(200,242,100,0.06)', border: '1px solid rgba(200,242,100,0.2)',
    borderRadius: '12px', padding: '20px', textAlign: 'center',
  },
  networthLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' },
  networthValue: { fontSize: '32px', fontFamily: "'DM Serif Display', Georgia, serif", marginBottom: '8px' },
  networthBreakdown: { fontSize: '12px', color: '#555', display: 'flex', gap: '8px', justifyContent: 'center' },
  infoCard: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '20px' },
  infoTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '15px', color: '#e8e8e8', marginBottom: '16px', fontWeight: 400 },
  infoRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '10px 0', borderBottom: '1px solid #1e1e1e',
  },
  infoLabel: { fontSize: '12px', color: '#555', paddingRight: '12px' },
  infoValue: { fontSize: '14px', color: '#c8f264', textAlign: 'right' },
  infoSub: { fontSize: '11px', color: '#555', textAlign: 'right', marginTop: '2px' },
  strategyBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '12px', background: 'rgba(200,242,100,0.1)',
    border: '1px solid rgba(200,242,100,0.3)', borderRadius: '10px',
    color: '#c8f264', fontSize: '14px', cursor: 'pointer', fontWeight: 500,
  },
  strategyBox: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '20px' },
  strategyHeader: {
    fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
  },
  strategyText: { fontSize: '13px', color: '#888', lineHeight: '1.7', whiteSpace: 'pre-wrap' },
  errorBox: {
    padding: '12px', background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px', color: '#ff6b6b', fontSize: '13px',
  },
  saveError: {
    padding: '12px 16px', background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '10px',
    color: '#ff6b6b', fontSize: '13px',
  },
}
