import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Save, RefreshCw, AlertTriangle, Eye, EyeOff } from 'lucide-react'

export default function Settings() {
  const { profile, settings, saveProfile, saveSettings, refreshRate, usdCadRate, rateLoading, clearAllData } = useApp()

  const [profileForm, setProfileForm] = useState({
    name: '',
    annual_income_cad: 0,
    annual_income_usd: 0,
    province: 'BC',
    birth_year: '',
    has_kids: false,
    kids_ages: '',
  })

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
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

  async function handleSaveKey(e) {
    e.preventDefault()
    setSavingKey(true)
    await saveSettings({ api_key: apiKey })
    setSavingKey(false)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  async function handleClearAll() {
    if (!dangerConfirm) {
      setDangerConfirm(true)
      return
    }
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
            <input
              value={profileForm.name}
              onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Your name"
              style={styles.input}
            />
          </Field>

          <Field label="Annual Income (CAD)">
            <input
              type="number" min="0" step="1000"
              value={profileForm.annual_income_cad}
              onChange={e => setProfileForm(p => ({ ...p, annual_income_cad: e.target.value }))}
              style={styles.input}
            />
          </Field>

          <Field label="Annual Income (USD)">
            <input
              type="number" min="0" step="1000"
              value={profileForm.annual_income_usd}
              onChange={e => setProfileForm(p => ({ ...p, annual_income_usd: e.target.value }))}
              style={styles.input}
            />
          </Field>

          <Field label="Province">
            <select
              value={profileForm.province}
              onChange={e => setProfileForm(p => ({ ...p, province: e.target.value }))}
              style={styles.input}
            >
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <Field label="Birth Year">
            <input
              type="number" min="1940" max={new Date().getFullYear() - 18}
              value={profileForm.birth_year}
              onChange={e => setProfileForm(p => ({ ...p, birth_year: e.target.value }))}
              placeholder="1985"
              style={styles.input}
            />
          </Field>

          <Field label="Has Kids">
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={profileForm.has_kids}
                onChange={e => setProfileForm(p => ({ ...p, has_kids: e.target.checked }))}
                style={{ marginRight: '8px' }}
              />
              Yes
            </label>
          </Field>

          {profileForm.has_kids && (
            <Field label="Kids' Ages (comma-separated)">
              <input
                value={profileForm.kids_ages}
                onChange={e => setProfileForm(p => ({ ...p, kids_ages: e.target.value }))}
                placeholder="5, 8, 12"
                style={styles.input}
              />
            </Field>
          )}

          <button type="submit" disabled={savingProfile} style={styles.saveBtn}>
            <Save size={13} />
            {savingProfile ? 'Saving...' : profileSaved ? 'Saved!' : 'Save Profile'}
          </button>
        </form>

        <div style={styles.rightColumn}>
          {/* API Key */}
          <form onSubmit={handleSaveKey} style={styles.card}>
            <h3 style={styles.cardTitle}>Anthropic API Key</h3>
            <p style={styles.hint}>Required for AI features (Ask CFO, insights, strategy). Your key is stored in Supabase and never logged.</p>

            <Field label="API Key">
              <div style={styles.keyWrap}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={{ ...styles.input, flex: 1, borderRadius: '8px 0 0 8px', borderRight: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  style={styles.eyeBtn}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            <button type="submit" disabled={savingKey} style={styles.saveBtn}>
              <Save size={13} />
              {savingKey ? 'Saving...' : keySaved ? 'Saved!' : 'Save Key'}
            </button>
          </form>

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
            <p style={styles.hint}>Rate is cached for 4 hours. Click refresh to fetch the latest rate.</p>
          </div>

          {/* Danger zone */}
          <div style={styles.dangerCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={14} color="#ff6b6b" />
              <h3 style={{ ...styles.cardTitle, marginBottom: 0, color: '#ff6b6b' }}>Danger Zone</h3>
            </div>
            <p style={styles.hint}>This will permanently delete all your transactions, account data, and chat history. Your profile and API key will remain.</p>
            <button
              onClick={handleClearAll}
              style={{
                ...styles.dangerBtn,
                background: dangerConfirm ? '#ff6b6b' : 'rgba(255,107,107,0.1)',
                color: dangerConfirm ? '#0f0f0f' : '#ff6b6b',
              }}
            >
              {dangerConfirm ? 'Click again to confirm' : 'Clear All Data'}
            </button>
            {dangerConfirm && (
              <button onClick={() => setDangerConfirm(false)} style={styles.cancelBtn}>Cancel</button>
            )}
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

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8' },
  layout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' },
  card: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px',
    padding: '24px', display: 'flex', flexDirection: 'column',
  },
  cardTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '16px', color: '#e8e8e8', marginBottom: '20px', fontWeight: 400 },
  hint: { fontSize: '12px', color: '#555', lineHeight: '1.6', marginBottom: '16px' },
  input: {
    padding: '9px 13px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#e8e8e8', fontSize: '13px', outline: 'none',
  },
  toggle: { display: 'flex', alignItems: 'center', fontSize: '13px', color: '#888', cursor: 'pointer' },
  saveBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '10px', background: '#c8f264',
    border: 'none', borderRadius: '8px',
    color: '#0f0f0f', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    marginTop: '4px',
  },
  keyWrap: { display: 'flex' },
  eyeBtn: {
    padding: '9px 12px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderLeft: 'none', borderRadius: '0 8px 8px 0',
    color: '#555', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
  },
  rightColumn: { display: 'flex', flexDirection: 'column', gap: '20px' },
  rateDisplay: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  rateLabel: { fontSize: '12px', color: '#555', marginBottom: '4px' },
  rateValue: { fontSize: '22px', fontFamily: "'DM Serif Display', Georgia, serif", color: '#c8f264' },
  refreshBtn: {
    display: 'flex', alignItems: 'center',
    padding: '8px 14px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#888', fontSize: '13px', cursor: 'pointer',
  },
  dangerCard: {
    background: 'rgba(255,107,107,0.05)', border: '1px solid rgba(255,107,107,0.2)',
    borderRadius: '12px', padding: '24px',
  },
  dangerBtn: {
    width: '100%', padding: '10px', border: '1px solid rgba(255,107,107,0.4)',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    width: '100%', padding: '10px', background: 'transparent',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#555', fontSize: '13px', cursor: 'pointer', marginTop: '8px',
  },
}
