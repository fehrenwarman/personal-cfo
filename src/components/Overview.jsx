import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { callClaude, buildFinancialContext } from '../lib/claude'
import { CATEGORY_COLORS } from '../lib/categories'
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react'

const INSIGHT_COLORS = {
  warning: { bg: 'rgba(255,209,102,0.1)', border: 'rgba(255,209,102,0.3)', text: '#ffd166', icon: AlertTriangle },
  opportunity: { bg: 'rgba(200,242,100,0.1)', border: 'rgba(200,242,100,0.3)', text: '#c8f264', icon: TrendingUp },
  positive: { bg: 'rgba(85,239,196,0.1)', border: 'rgba(85,239,196,0.3)', text: '#55efc4', icon: TrendingUp },
  info: { bg: 'rgba(116,185,255,0.1)', border: 'rgba(116,185,255,0.3)', text: '#74b9ff', icon: Info },
}

export default function Overview() {
  const { profile, accounts, transactions, settings, usdCadRate } = useApp()
  const [view, setView] = useState('all') // all | personal | business
  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState(null)

  const filteredTx = useMemo(() => {
    if (view === 'all') return transactions
    return transactions.filter(t => t.mode === view)
  }, [transactions, view])

  const metrics = useMemo(() => {
    const income = filteredTx
      .filter(t => t.amount > 0 || t.category === 'income')
      .reduce((s, t) => s + (t.amount_cad || 0), 0)

    const expenses = filteredTx
      .filter(t => t.amount < 0 && t.category !== 'income')
      .reduce((s, t) => s + Math.abs(t.amount_cad || 0), 0)

    const net = income - expenses
    const savingsRate = income > 0 ? (net / income) * 100 : 0

    return { income, expenses, net, savingsRate }
  }, [filteredTx])

  const categoryData = useMemo(() => {
    const map = {}
    filteredTx
      .filter(t => t.amount < 0 && t.category !== 'income')
      .forEach(t => {
        const cat = t.category || 'other'
        map[cat] = (map[cat] || 0) + Math.abs(t.amount_cad || 0)
      })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [filteredTx])

  const netWorth = useMemo(() => {
    if (!accounts) return 0
    return (
      (accounts.tfsa_balance || 0) +
      (accounts.rrsp_balance || 0) +
      (accounts.resp_balance || 0) +
      (accounts.non_registered || 0) +
      (accounts.savings_cad || 0) +
      (accounts.savings_usd || 0) * usdCadRate
    )
  }, [accounts, usdCadRate])

  useEffect(() => {
    if (transactions.length > 0 && !insights && settings?.api_key) {
      fetchInsights()
    }
  }, [transactions.length, settings?.api_key])

  async function fetchInsights() {
    if (!settings?.api_key) {
      setInsightsError('Add your Anthropic API key in Settings to enable AI insights.')
      return
    }
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      const context = buildFinancialContext({ profile, accounts, transactions, usdCadRate })
      const text = await callClaude({
        apiKey: settings.api_key,
        system: `You are a personal CFO assistant. Return ONLY a valid JSON array with exactly 4 insight objects. Each object must have: title (string), body (string, 2-3 sentences max, no bullet points, no em dashes, warm and direct tone), type (one of: warning, opportunity, positive, info). No markdown, no explanation, just the JSON array.`,
        messages: [{ role: 'user', content: `Based on this financial profile, generate 4 CFO insights:\n${context}` }],
        maxTokens: 800,
      })
      const parsed = JSON.parse(text.trim())
      setInsights(parsed)
    } catch (err) {
      setInsightsError(err.message)
    } finally {
      setInsightsLoading(false)
    }
  }

  const fmtCAD = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Overview</h2>
        <div style={styles.viewToggle}>
          {['all', 'personal', 'business'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ ...styles.toggleBtn, ...(view === v ? styles.toggleBtnActive : {}) }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div style={styles.metricsGrid}>
        <MetricCard label="Total Income" value={fmtCAD(metrics.income)} positive />
        <MetricCard label="Total Expenses" value={fmtCAD(metrics.expenses)} negative />
        <MetricCard label="Net Cash Flow" value={fmtCAD(metrics.net)} positive={metrics.net >= 0} negative={metrics.net < 0} />
        <MetricCard label="Savings Rate" value={`${metrics.savingsRate.toFixed(1)}%`} positive={metrics.savingsRate > 0} />
      </div>

      <div style={styles.twoCol}>
        {/* Spending donut */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Spending by Category</h3>
          {categoryData.length === 0 ? (
            <div style={styles.empty}>No expense data yet. Import transactions to see your spending breakdown.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {categoryData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#636e72'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e8e8e8' }}
                    formatter={(v) => [fmtCAD(v), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.legend}>
                {categoryData.map(d => (
                  <div key={d.name} style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, background: CATEGORY_COLORS[d.name] || '#636e72' }} />
                    <span style={styles.legendLabel}>{d.name}</span>
                    <span style={styles.legendValue}>{fmtCAD(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Accounts summary */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Account Balances</h3>
          {accounts ? (
            <>
              <AccountRow label="TFSA" value={fmtCAD(accounts.tfsa_balance || 0)} />
              <AccountRow label="RRSP" value={fmtCAD(accounts.rrsp_balance || 0)} />
              <AccountRow label="RESP" value={fmtCAD(accounts.resp_balance || 0)} />
              <AccountRow label="Non-Registered" value={fmtCAD(accounts.non_registered || 0)} />
              <AccountRow label="Savings CAD" value={fmtCAD(accounts.savings_cad || 0)} />
              <AccountRow
                label="Savings USD"
                value={`$${(accounts.savings_usd || 0).toLocaleString()} USD`}
                sub={fmtCAD((accounts.savings_usd || 0) * usdCadRate)}
              />
              <div style={styles.netWorthRow}>
                <span style={styles.netWorthLabel}>Net Worth</span>
                <span style={styles.netWorthValue}>{fmtCAD(netWorth)}</span>
              </div>
            </>
          ) : (
            <div style={styles.empty}>No account data. Update balances in the Accounts tab.</div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <div style={styles.card}>
        <div style={styles.insightsHeader}>
          <h3 style={styles.cardTitle}>AI Insights</h3>
          <button onClick={fetchInsights} disabled={insightsLoading} style={styles.refreshBtn}>
            <RefreshCw size={13} style={{ marginRight: '6px' }} />
            {insightsLoading ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>

        {insightsError && <div style={styles.insightsError}>{insightsError}</div>}

        {!insights && !insightsLoading && !insightsError && (
          <div style={styles.empty}>
            {transactions.length === 0
              ? 'Import transactions to unlock AI insights.'
              : 'Click Refresh to generate insights.'}
          </div>
        )}

        {insightsLoading && (
          <div style={styles.empty}>Analyzing your finances...</div>
        )}

        {insights && (
          <div style={styles.insightsGrid}>
            {insights.map((insight, i) => {
              const cfg = INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.info
              const Icon = cfg.icon
              return (
                <div key={i} style={{ ...styles.insightCard, background: cfg.bg, borderColor: cfg.border }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Icon size={14} color={cfg.text} />
                    <span style={{ ...styles.insightTitle, color: cfg.text }}>{insight.title}</span>
                  </div>
                  <p style={styles.insightBody}>{insight.body}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, positive, negative }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{
        ...styles.metricValue,
        color: positive ? '#c8f264' : negative ? '#ff6b6b' : '#e8e8e8',
      }}>
        {value}
      </div>
    </div>
  )
}

function AccountRow({ label, value, sub }) {
  return (
    <div style={styles.accountRow}>
      <span style={styles.accountLabel}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={styles.accountValue}>{value}</span>
        {sub && <div style={styles.accountSub}>{sub} CAD equiv</div>}
      </div>
    </div>
  )
}

const styles = {
  page: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '26px',
    color: '#e8e8e8',
  },
  viewToggle: {
    display: 'flex',
    gap: '4px',
    background: '#1e1e1e',
    borderRadius: '8px',
    padding: '4px',
  },
  toggleBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
  },
  toggleBtnActive: {
    background: '#2a2a2a',
    color: '#e8e8e8',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  metricCard: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '20px',
  },
  metricLabel: {
    fontSize: '12px',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  },
  metricValue: {
    fontSize: '22px',
    fontFamily: "'DM Serif Display', Georgia, serif",
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  card: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '24px',
  },
  cardTitle: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '16px',
    color: '#e8e8e8',
    marginBottom: '16px',
    fontWeight: 400,
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '12px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: '13px',
    color: '#888',
    flex: 1,
    textTransform: 'capitalize',
  },
  legendValue: {
    fontSize: '13px',
    color: '#e8e8e8',
  },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '10px 0',
    borderBottom: '1px solid #1e1e1e',
  },
  accountLabel: {
    fontSize: '13px',
    color: '#888',
  },
  accountValue: {
    fontSize: '14px',
    color: '#e8e8e8',
  },
  accountSub: {
    fontSize: '11px',
    color: '#555',
    textAlign: 'right',
  },
  netWorthRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '12px',
    marginTop: '4px',
  },
  netWorthLabel: {
    fontSize: '13px',
    color: '#c8f264',
    fontWeight: 600,
  },
  netWorthValue: {
    fontSize: '18px',
    fontFamily: "'DM Serif Display', Georgia, serif",
    color: '#c8f264',
  },
  insightsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    background: '#1e1e1e',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
  },
  insightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  insightCard: {
    borderRadius: '10px',
    border: '1px solid',
    padding: '16px',
  },
  insightTitle: {
    fontSize: '13px',
    fontWeight: 600,
  },
  insightBody: {
    fontSize: '13px',
    color: '#888',
    lineHeight: '1.6',
  },
  insightsError: {
    padding: '12px 14px',
    background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: '8px',
    color: '#ff6b6b',
    fontSize: '13px',
  },
  empty: {
    color: '#555',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px 0',
  },
}
