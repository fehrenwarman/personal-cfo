import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Check your email for a confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <h1 style={styles.logo}>Personal CFO</h1>
          <p style={styles.tagline}>Your financial intelligence layer</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.tabs}>
            <button
              type="button"
              style={{ ...styles.tab, ...(mode === 'signin' ? styles.tabActive : {}) }}
              onClick={() => setMode('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              style={{ ...styles.tab, ...(mode === 'signup' ? styles.tabActive : {}) }}
              onClick={() => setMode('signup')}
            >
              Sign Up
            </button>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={styles.input}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}
          {message && <div style={styles.success}>{message}</div>}

          <button type="submit" disabled={loading} style={styles.submit}>
            {loading ? 'Loading...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#161616',
    borderRadius: '16px',
    border: '1px solid #2a2a2a',
    padding: '40px',
  },
  brand: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '28px',
    fontWeight: 400,
    color: '#c8f264',
    margin: '0 0 8px',
  },
  tagline: {
    color: '#888',
    fontSize: '14px',
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    background: '#1e1e1e',
    borderRadius: '8px',
    padding: '4px',
    marginBottom: '24px',
  },
  tab: {
    flex: 1,
    padding: '8px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#888',
    fontSize: '14px',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: '#2a2a2a',
    color: '#e8e8e8',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    color: '#888',
  },
  input: {
    padding: '10px 14px',
    background: '#1e1e1e',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e8e8e8',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(255,107,107,0.12)',
    border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: '8px',
    color: '#ff6b6b',
    fontSize: '13px',
  },
  success: {
    padding: '10px 14px',
    background: 'rgba(200,242,100,0.12)',
    border: '1px solid rgba(200,242,100,0.3)',
    borderRadius: '8px',
    color: '#c8f264',
    fontSize: '13px',
  },
  submit: {
    padding: '12px',
    background: '#c8f264',
    border: 'none',
    borderRadius: '8px',
    color: '#0f0f0f',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
  },
}
