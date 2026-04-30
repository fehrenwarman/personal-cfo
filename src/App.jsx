import { AppProvider, useApp } from './context/AppContext'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Overview from './components/Overview'
import Transactions from './components/Transactions'
import Accounts from './components/Accounts'
import AskCFO from './components/AskCFO'
import Settings from './components/Settings'

function AppInner() {
  const { session, loading, activeTab } = useApp()

  if (loading) {
    return (
      <div style={styles.loader}>
        <div style={styles.loaderDot} />
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  const tabs = {
    overview: <Overview />,
    transactions: <Transactions />,
    accounts: <Accounts />,
    askcfo: <AskCFO />,
    settings: <Settings />,
  }

  return (
    <div style={styles.layout}>
      <Sidebar />
      <main style={styles.main}>
        {tabs[activeTab] || <Overview />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}

const styles = {
  loader: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#c8f264',
    animation: 'pulse 1s ease-in-out infinite',
  },
  layout: {
    display: 'flex',
    minHeight: '100vh',
    background: '#0f0f0f',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    background: '#0f0f0f',
  },
}
