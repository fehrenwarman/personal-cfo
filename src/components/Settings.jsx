import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { Save, RefreshCw, AlertTriangle, Eye, EyeOff, RefreshCcw, CheckCircle } from 'lucide-react'

export default function Settings() {
  const {
    profile, settings, saveProfile, saveSettings,
    refreshRate, usdCadRate, rateLoading,
    clearAllData,
    lmActive, lmSyncing, lmSyncedAt, lmError, triggerLmSync,
  } = useApp()

  const [profileForm, setProfileForm] = useState({
    name: '', annual_income_cad: 0, annual_income_usd: 0,
    province: 'BC', birth_year: '', has_kids: false, kids_ages: '',
  })

  const [apiKey, setApiKey]         = useState('')
  const [lmKey, setLmKey]           = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [showLmKey, setShowLmKey]   = useState(false)

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingKeys, setSavingKeys]       = useState(false)
  const [profileSaved, setProfileSaved]   = useState(false)
  const [keysSaved, setKeysSaved]         = useState(false)
  const [dangerConfirm, setDangerConfirm] = useState(false)

  useEffect(() => {
    if (profile) {
      setProfileForm({
        name: profile.name || '',
        annual_income_cad: profile.annual_income_cad || 0,
        annual_income_usd: profile.annual_income_usd || 0,
        province: profile.province || 'BC',
        birth_year: profile.birth_year || '',
        has_kids: profile.has_kids || false,
        kids_ages: (profile.kids_ages || []).join(', '),
      })
    }
  }, [profile])

  useEffect(() => {
    if (settings?.api_key) setApiKey(settings.api_key)
    if (settings?.lunchmoney_key) setLmKey(settings.lunchmoney_key)
  }, [settings])

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    const kidsAges = profileForm.kids_ages
      ? profileForm.kids_ages.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      : []
    await saveProfile({
      name: profileForm.name,
      annual_income_cad: parseFloat(profileForm.annual_income_cad) || 0,
      annual_income_usd: parseFloat(profileForm.annual_income_usd) || 0,
      province: profileForm.province,
      birth_year: parseInt(profileForm.birth_year) || null,
      has_kids: profileForm.has_kids,
      kids_ages: kidsAges,
    })
    setSavingProfile(false)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  async function handleSaveKeys(e) {
    e.preventDefault()
    setSavingKeys(true)
    const hadLmKey = Boolean(settings?.lunchmoney_key)
    await saveSettings({ api_key: apiKey, lunchmoney_key: lmKey })
    setSavingKeys(false)
    setKeysSaved(true)
    setTimeout(() => setKeysSaved(false), 2000)
    // If LM key was just added or changed, trigger a sync
    if (lmKey && lmKey !== settings?.lunchmoney_key) {
      await triggerLmSync()
    }
  }

  async function handleClearAll() {
    if (!dangerConfirm) { setDangerConfirm(true); return }
    await clearAllData()
    setDangerConfirm(false)
  }

  const provinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Settings</h2>

      <div style={styles.layout}>
        {/* Profile */}
        <form onSubmit={handleSaveProfile} style={styles.card}>
          <h3 style={styles.cardTitle}>Profile</h3>

          <Field label="Name">
            <input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} placeholder="Your name" style={styles.input} />
          </Field>
          <Field label="Annual Income (CAD)">
            <input type="number" min="0" step="1000" value={profileForm.annual_income_cad} onChange={e => setProfileForm(p => ({ ...p, annual_income_cad: e.target.value }))} style={styles.input} />
          </Field>
          <Field label="Annual Income (USD)">
            <input type="number" min="0" step="1000" value={profileForm.annual_income_usd} onChange={e => setProfileForm(p => ({ ...p, annual_income_usd: e.target.value }))} style={styles.input} />
          </Field>
          <Field label="Province">
            <select value={profileForm.province} onChange={e => setProfileForm(p => ({ ...p, province: e.target.value }))} style={styles.input}>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Birth Year">
            <input type="number" min="1940" max={new Date().getFullYear() - 18} value={profileForm.birth_year} onChange={e => setProfileForm(p => ({ ...p, birth_year: e.target.value }))} placeholder="1985" style={styles.input} />
          </Field>
          <Field label="Has Kids">
            <label style={styles.toggle}>
              <input type="checkbox" checked={profileForm.has_kids} onChange={e => setProfileForm(p => ({ ...p, has_kids: e.target.checked }))} style={{ marginRight: '8px' }} />
              Yes
            </label>
          </Field>
          {profileForm.has_kids && (
            <Field label="Kids' Ages (comma-separated)">
              <input value={profileForm.kids_ages} onChange={e => setProfileForm(p => ({ ...p, kids_ages: e.target.value }))} placeholder="5, 8, 12" style={styles.input} />
            </Field>
          )}

          <button type="submit" disabled={savingProfile} style={styles.saveBtn}>
            <Save size={13} />
            {savingProfile ? 'Saving...' : profileSaved ? 'Saved!' : 'Save Profile'}
          </button>
        </form>

        <div style={styles.rightColumn}>
          {/* API Keys */}
          <form onSubmit={handleSaveKeys} style={styles.card}>
            <h3 style={styles.cardTitle}>API Keys</h3>

            {/* LunchMoney */}
            <div style={styles.keySection}>
              <div style={styles.keySectionHeader}>
                <div style={styles.keySectionTitle}>LunchMoney</div>
                {lmActive && (
                  <div style={styles.lmStatus}>
                    {lmSyncing ? (
                      <span style={styles.syncing}>Syncing...</span>
                    ) : lmSyncedAt ? (
                      <span style={styles.synced}>
                        <CheckCircle size={11} style={{ marginRight: 4 }} />
                        Synced {lmSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <p style={styles.hint}>
                Connect LunchMoney to auto-import transactions and account balances. Get your access token from LunchMoney → Settings → Developers.
              </p>
              {lmError && <div style={styles.lmError}>{lmError}</div>}
              <Field label="Access Token">
                <KeyInput value={lmKey} onChange={setLmKey} show={showLmKey} onToggle={() => setShowLmKey(v => !v)} placeholder="your-lunchmoney-token" />
              </Field>
            </div>

            <div style={styles.divider} />

            {/* Anthropic */}
            <div style={styles.keySection}>
              <div style={styles.keySectionTitle}>Anthropic (Claude)</div>
              <p style={styles.hint}>Required for Ask CFO chat, AI insights, and strategy generation.</p>
              <Field label="API Key">
                <KeyInput value={apiKey} onChange={setApiKey} show={showApiKey} onToggle={() => setShowApiKey(v => !v)} placeholder="sk-ant-..." />
              </Field>
            </div>

            <button type="submit" disabled={savingKeys} style={styles.saveBtn}>
              <Save size={13} />
              {savingKeys ? 'Saving...' : keysSaved ? 'Saved!' : 'Save Keys'}
            </button>
          </form>

          {/* LunchMoney sync status */}
          {lmActive && (
            <div style={styles.syncCard}>
              <div style={styles.syncHeader}>
                <div>
                  <div style={styles.syncTitle}>LunchMoney Sync</div>
                  <div style={styles.syncSub}>Last 6 months · auto-syncs on login</div>
                </div>
                <button onClick={triggerLmSync} disabled={lmSyncing} style={styles.syncBtn}>
                  <RefreshCcw size={13} style={{ marginRight: 6 }} />
                  {lmSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
              {lmSyncedAt && (
                <div style={styles.syncTime}>
                  Last synced: {lmSyncedAt.toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* Exchange rate */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Exchange Rate</h3>
            <div style={styles.rateDisplay}>
              <div>
                <div style={styles.rateLabel}>Current USD/CAD</div>
                <div style={styles.rateValue}>{usdCadRate.toFixed(4)}</div>
              </div>
              <button onClick={refreshRate} disabled={rateLoading} style={styles.refreshBtn}>
                <RefreshCw size={13} style={{ marginRight: '6px' }} />
                {rateLoading ? 'Refreshing...' : 'Refresh Rate'}
              </button>
            </div>
            <p style={styles.hint}>Cached for 4 hours.</p>
          </div>

          {/* Danger zone */}
          <div style={styles.dangerCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={14} color="#ff6b6b" />
              <h3 style={{ ...styles.cardTitle, marginBottom: 0, color: '#ff6b6b' }}>Danger Zone</h3>
            </div>
            <p style={styles.hint}>Clears all local transaction data, account data, and chat history.</p>
            <button onClick={handleClearAll} style={{ ...styles.dangerBtn, background: dangerConfirm ? '#ff6b6b' : 'rgba(255,107,107,0.1)', color: dangerConfirm ? '#0f0f0f' : '#ff6b6b' }}>
              {dangerConfirm ? 'Click again to confirm' : 'Clear All Data'}
            </button>
            {dangerConfirm && <button onClick={() => setDangerConfirm(false)} style={styles.cancelBtn}>Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
      <label style={{ fontSize: '12px', color: '#555' }}>{label}</label>
      {children}
    </div>
  )
}

function KeyInput({ value, onChange, show, onToggle, placeholder }) {
  return (
    <div style={{ display: 'flex' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: '9px 13px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRight: 'none', borderRadius: '8px 0 0 8px', color: '#e8e8e8', fontSize: '13px', outline: 'none', flex: 1 }}
      />
      <button type="button" onClick={onToggle} style={{ padding: '9px 12px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderLeft: 'none', borderRadius: '0 8px 8px 0', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8' },
  layout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' },
  card: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' },
  cardTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '16px', color: '#e8e8e8', marginBottom: '20px', fontWeight: 400 },
  hint: { fontSize: '12px', color: '#555', lineHeight: '1.6', marginBottom: '12px' },
  input: { padding: '9px 13px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e8e8e8', fontSize: '13px', outline: 'none' },
  toggle: { display: 'flex', alignItems: 'center', fontSize: '13px', color: '#888', cursor: 'pointer' },
  saveBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#c8f264', border: 'none', borderRadius: '8px', color: '#0f0f0f', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' },
  rightColumn: { display: 'flex', flexDirection: 'column', gap: '20px' },
  keySection: { display: 'flex', flexDirection: 'column' },
  keySectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  keySectionTitle: { fontSize: '13px', color: '#888', fontWeight: 500 },
  divider: { height: '1px', background: '#2a2a2a', margin: '16px 0' },
  lmStatus: { display: 'flex', alignItems: 'center' },
  syncing: { fontSize: '11px', color: '#ffd166' },
  synced: { fontSize: '11px', color: '#c8f264', display: 'flex', alignItems: 'center' },
  lmError: { padding: '8px 12px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px', color: '#ff6b6b', fontSize: '12px', marginBottom: '12px' },
  syncCard: { background: '#161616', border: '1px solid rgba(200,242,100,0.2)', borderRadius: '12px', padding: '20px' },
  syncHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  syncTitle: { fontSize: '14px', color: '#e8e8e8', fontWeight: 500 },
  syncSub: { fontSize: '12px', color: '#555', marginTop: '2px' },
  syncBtn: { display: 'flex', alignItems: 'center', padding: '7px 14px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#888', fontSize: '12px', cursor: 'pointer' },
  syncTime: { fontSize: '11px', color: '#555', marginTop: '12px' },
  rateDisplay: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  rateLabel: { fontSize: '12px', color: '#555', marginBottom: '4px' },
  rateValue: { fontSize: '22px', fontFamily: "'DM Serif Display', Georgia, serif", color: '#c8f264' },
  refreshBtn: { display: 'flex', alignItems: 'center', padding: '8px 14px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#888', fontSize: '13px', cursor: 'pointer' },
  dangerCard: { background: 'rgba(255,107,107,0.05)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: '12px', padding: '24px' },
  dangerBtn: { width: '100%', padding: '10px', border: '1px solid rgba(255,107,107,0.4)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { width: '100%', padding: '10px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#555', fontSize: '13px', cursor: 'pointer', marginTop: '8px' },
}
