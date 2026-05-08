import { useState, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useApp } from '../context/AppContext'
import { CATEGORY_COLORS } from '../lib/categories'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthKey(date) { return date?.slice(0, 7) || '' }
function monthLabel(key) {
  const [y, m] = key.split('-')
  return `${MONTH_NAMES[+m - 1]} '${y.slice(2)}`
}
function yearKey(date) { return date?.slice(0, 4) || '' }

const fmtCAD = n =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={styles.tooltip}>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.color, fontSize: 13, marginBottom: 3 }}>
          <span style={{ textTransform: 'capitalize' }}>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmtCAD(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const PieTooltip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0
  return (
    <div style={styles.tooltip}>
      <div style={{ color: CATEGORY_COLORS[name] || '#888', fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>{name}</div>
      <div style={{ color: '#e8e8e8' }}>{fmtCAD(value)}</div>
      <div style={{ color: '#555', fontSize: 12 }}>{pct}%</div>
    </div>
  )
}

export default function Reports() {
  const { transactions } = useApp()
  const [view, setView] = useState('all')
  const [period, setPeriod] = useState('monthly')

  const filtered = useMemo(() =>
    view === 'all' ? transactions : transactions.filter(t => t.mode === view),
    [transactions, view]
  )

  // Build time-series data grouped by month or year
  const chartData = useMemo(() => {
    const map = {}

    filtered.forEach(t => {
      const key = period === 'monthly' ? monthKey(t.date) : yearKey(t.date)
      if (!key) return
      if (!map[key]) map[key] = { key, income: 0, expenses: 0 }

      const amt = t.amount_cad || 0
      if (t.category === 'income' || amt > 0) {
        map[key].income += Math.abs(amt)
      } else if (amt < 0) {
        map[key].expenses += Math.abs(amt)
      }
    })

    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(d => ({
        label: period === 'monthly' ? monthLabel(d.key) : d.key,
        income: Math.round(d.income),
        expenses: Math.round(d.expenses),
        net: Math.round(d.income - d.expenses),
      }))
  }, [filtered, period])

  // Expense breakdown by category for pie
  const { pieData, totalExpenses } = useMemo(() => {
    const map = {}
    let total = 0
    filtered
      .filter(t => t.category !== 'income' && (t.amount_cad || 0) < 0)
      .forEach(t => {
        const cat = t.category || 'other'
        map[cat] = (map[cat] || 0) + Math.abs(t.amount_cad || 0)
        total += Math.abs(t.amount_cad || 0)
      })
    return {
      pieData: Object.entries(map)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value),
      totalExpenses: total,
    }
  }, [filtered])

  // Summary totals
  const totals = useMemo(() => {
    const income   = chartData.reduce((s, d) => s + d.income, 0)
    const expenses = chartData.reduce((s, d) => s + d.expenses, 0)
    const savings  = income > 0 ? ((income - expenses) / income) * 100 : 0
    return { income, expenses, net: income - expenses, savingsRate: savings }
  }, [chartData])

  const isEmpty = filtered.length === 0

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Reports</h2>
        <div style={styles.controls}>
          <div style={styles.toggle}>
            {['all', 'personal', 'business'].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ ...styles.toggleBtn, ...(view === v ? styles.toggleActive : {}) }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div style={styles.toggle}>
            {['monthly', 'yearly'].map(v => (
              <button key={v} onClick={() => setPeriod(v)}
                style={{ ...styles.toggleBtn, ...(period === v ? styles.toggleActive : {}) }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div style={styles.empty}>No transaction data. Sync LunchMoney or import transactions first.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={styles.cards}>
            <SummaryCard label="Total Income" value={fmtCAD(totals.income)} color="#c8f264" />
            <SummaryCard label="Total Expenses" value={fmtCAD(totals.expenses)} color="#ff6b6b" />
            <SummaryCard label="Net Cash Flow" value={fmtCAD(totals.net)} color={totals.net >= 0 ? '#c8f264' : '#ff6b6b'} />
            <SummaryCard label="Savings Rate" value={`${totals.savingsRate.toFixed(1)}%`} color="#74b9ff" />
          </div>

          {/* Main trend chart */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>
              {period === 'monthly' ? 'Monthly' : 'Yearly'} Income vs Expenses
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#555', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#555', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#888', paddingTop: 12 }}
                  formatter={v => v.charAt(0).toUpperCase() + v.slice(1)}
                />
                <Bar dataKey="income"   name="income"   fill="#c8f264" opacity={0.85} radius={[3,3,0,0]} maxBarSize={40} />
                <Bar dataKey="expenses" name="expenses" fill="#ff6b6b" opacity={0.85} radius={[3,3,0,0]} maxBarSize={40} />
                <Line dataKey="net" name="net" type="monotone" stroke="#74b9ff" strokeWidth={2} dot={{ r: 3, fill: '#74b9ff' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom row: pie + category table */}
          <div style={styles.bottomRow}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Expense Breakdown</div>
              <div style={styles.totalLabel}>Total expenses</div>
              <div style={styles.totalValue}>{fmtCAD(totalExpenses)}</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                    innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#636e72'} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip total={totalExpenses} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.legend}>
                {pieData.map(({ name, value }) => (
                  <div key={name} style={styles.legendRow}>
                    <span style={{ ...styles.dot, background: CATEGORY_COLORS[name] || '#636e72' }} />
                    <span style={styles.legendCat}>{name}</span>
                    <span style={styles.legendPct}>
                      {totalExpenses > 0 ? ((value / totalExpenses) * 100).toFixed(1) : 0}%
                    </span>
                    <span style={styles.legendAmt}>{fmtCAD(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Month-by-month table */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>Period Detail</div>
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <span>Period</span>
                  <span style={{ textAlign: 'right' }}>Income</span>
                  <span style={{ textAlign: 'right' }}>Expenses</span>
                  <span style={{ textAlign: 'right' }}>Net</span>
                </div>
                {[...chartData].reverse().map(row => (
                  <div key={row.label} style={styles.tableRow}>
                    <span style={{ color: '#888' }}>{row.label}</span>
                    <span style={{ color: '#c8f264', textAlign: 'right' }}>{fmtCAD(row.income)}</span>
                    <span style={{ color: '#ff6b6b', textAlign: 'right' }}>{fmtCAD(row.expenses)}</span>
                    <span style={{ color: row.net >= 0 ? '#74b9ff' : '#ff6b6b', fontWeight: 600, textAlign: 'right' }}>
                      {fmtCAD(row.net)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={{ ...styles.summaryValue, color }}>{value}</div>
    </div>
  )
}

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8', margin: 0 },
  controls: { display: 'flex', gap: 8 },
  toggle: { display: 'flex', gap: '4px', background: '#1e1e1e', borderRadius: '8px', padding: '4px' },
  toggleBtn: { padding: '6px 14px', border: 'none', borderRadius: '6px', background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer' },
  toggleActive: { background: '#2a2a2a', color: '#e8e8e8' },
  empty: { color: '#555', fontSize: '13px', textAlign: 'center', padding: '80px 0' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
  summaryCard: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '20px 24px' },
  summaryLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
  summaryValue: { fontSize: '22px', fontFamily: "'DM Serif Display', Georgia, serif" },
  card: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px' },
  cardTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '16px', color: '#e8e8e8', fontWeight: 400, marginBottom: 16 },
  bottomRow: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' },
  totalLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  totalValue: { fontSize: '22px', fontFamily: "'DM Serif Display', Georgia, serif", color: '#ff6b6b', marginBottom: 4 },
  legend: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  legendRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legendCat: { fontSize: 12, color: '#888', flex: 1, textTransform: 'capitalize' },
  legendPct: { fontSize: 12, color: '#555', width: 40, textAlign: 'right' },
  legendAmt: { fontSize: 12, color: '#e8e8e8', width: 90, textAlign: 'right' },
  tooltip: { background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px' },
  table: { display: 'flex', flexDirection: 'column', gap: 2 },
  tableHeader: {
    display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr',
    padding: '8px 12px', fontSize: 11, color: '#555',
    textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2a2a2a', marginBottom: 4,
  },
  tableRow: {
    display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr',
    padding: '9px 12px', fontSize: 13, borderRadius: 8,
    transition: 'background 0.1s',
  },
}
