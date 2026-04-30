import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { LayoutDashboard, ArrowLeftRight, Wallet, MessageSquare, Settings, LogOut } from 'lucide-react'

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'askcfo', label: 'Ask CFO', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { activeTab, setActiveTab, usdCadRate, rateLoading, profile } = useApp()

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>
        <h1 style={styles.logo}>Personal CFO</h1>
        {profile?.name && <div style={styles.userName}>{profile.name}</div>}
      </div>

      <nav style={styles.nav}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              ...styles.navItem,
              ...(activeTab === id ? styles.navItemActive : {}),
            }}
          >
            <Icon size={16} style={{ flexShrink: 0 }} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div style={styles.bottom}>
        <div style={styles.rateCard}>
          <div style={styles.rateLabel}>USD / CAD</div>
          <div style={styles.rateValue}>
            {rateLoading ? '...' : usdCadRate.toFixed(4)}
          </div>
          <div style={styles.rateSub}>live rate</div>
        </div>

        <button onClick={handleSignOut} style={styles.signOut}>
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    width: '220px',
    minWidth: '220px',
    height: '100vh',
    position: 'sticky',
    top: 0,
    background: '#161616',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
  },
  brand: {
    padding: '0 20px 24px',
    borderBottom: '1px solid #2a2a2a',
    marginBottom: '12px',
  },
  logo: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '18px',
    fontWeight: 400,
    color: '#c8f264',
    margin: '0 0 4px',
  },
  userName: {
    fontSize: '12px',
    color: '#555',
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 12px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#888',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  navItemActive: {
    background: 'rgba(200,242,100,0.10)',
    color: '#c8f264',
  },
  bottom: {
    padding: '16px 12px 0',
    borderTop: '1px solid #2a2a2a',
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rateCard: {
    background: '#1e1e1e',
    borderRadius: '10px',
    padding: '12px 14px',
    border: '1px solid #2a2a2a',
  },
  rateLabel: {
    fontSize: '11px',
    color: '#555',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  rateValue: {
    fontSize: '20px',
    fontFamily: "'DM Serif Display', Georgia, serif",
    color: '#c8f264',
    margin: '2px 0 2px',
  },
  rateSub: {
    fontSize: '11px',
    color: '#555',
  },
  signOut: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#555',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'color 0.15s',
    width: '100%',
  },
}
