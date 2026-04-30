import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { callClaude, buildFinancialContext } from '../lib/claude'
import { Save, Sparkles } from 'lucide-react'

const ACCOUNT_FIELDS = [
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

export default function Accounts() {
  const { accounts, saveAccounts, profile, transactions, settings, usdCadRate } = useApp()
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [strategy, setStrategy] = useState(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyError, setStrategyError] = useState(null)

  useEffect(() => {
    if (accounts) setForm(accounts)
  }, [accounts])

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: parseFloat(value) || 0 }))
  }

  async function handleSave() {
    setSaving(true)
    await saveAccounts(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
      const context = buildFinancialContext({ profile, accounts: form, transactions, usdCadRate })
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

  const totalIncome = ((profile?.annual_income_cad || 0) + (profile?.annual_income_usd || 0) * usdCadRate)
  const estimatedRrspRoom = Math.min(Math.round(totalIncome * 0.18), 32490)
  const kidsCount = profile?.has_kids && profile?.kids_ages?.length ? profile.kids_ages.length : 0

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Accounts</h2>
        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
          <Save size={13} />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div style={styles.layout}>
        {/* Account form */}
        <div style={styles.formCard}>
          {['tfsa', 'rrsp', 'resp', 'other'].map(group => {
            const fields = ACCOUNT_FIELDS.filter(f => f.group === group)
            const groupLabels = { tfsa: 'TFSA', rrsp: 'RRSP', resp: 'RESP', other: 'Other Accounts' }
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

        {/* Info panel */}
        <div style={styles.infoColumn}>
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
            <InfoRow
              label="Live USD/CAD"
              value={usdCadRate.toFixed(4)}
            />
            {(form.savings_usd > 0) && (
              <InfoRow
                label="USD savings in CAD"
                value={`$${Math.round((form.savings_usd || 0) * usdCadRate).toLocaleString()}`}
                sub={`${form.savings_usd.toLocaleString()} USD`}
              />
            )}
          </div>

          <button onClick={generateStrategy} disabled={strategyLoading} style={styles.strategyBtn}>
            <Sparkles size={14} />
            {strategyLoading ? 'Generating...' : 'Generate Strategy'}
          </button>

          {strategyError && (
            <div style={styles.errorBox}>{strategyError}</div>
          )}

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
  layout: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' },
  formCard: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px',
    padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px',
  },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '12px' },
  groupLabel: {
    fontSize: '11px', color: '#555', textTransform: 'uppercase',
    letterSpacing: '0.08em', paddingBottom: '8px', borderBottom: '1px solid #2a2a2a',
  },
  field: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  label: { fontSize: '13px', color: '#888', flex: 1 },
  inputWrap: { display: 'flex', alignItems: 'center', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', overflow: 'hidden' },
  inputPrefix: { padding: '8px 10px', fontSize: '11px', color: '#555', borderRight: '1px solid #2a2a2a', background: '#1a1a1a' },
  input: {
    padding: '8px 12px', background: 'transparent', border: 'none',
    color: '#e8e8e8', fontSize: '14px', outline: 'none', width: '140px', textAlign: 'right',
  },
  infoColumn: { display: 'flex', flexDirection: 'column', gap: '16px' },
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
  strategyBox: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '20px',
  },
  strategyHeader: {
    fontSize: '11px', color: '#555', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '12px',
  },
  strategyText: { fontSize: '13px', color: '#888', lineHeight: '1.7', whiteSpace: 'pre-wrap' },
  errorBox: {
    padding: '12px', background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px',
    color: '#ff6b6b', fontSize: '13px',
  },
}
