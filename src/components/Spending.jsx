import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { CATEGORY_COLORS } from '../lib/categories'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// Canadian average household spending distribution (% of total expenses)
// Source: Statistics Canada Survey of Household Spending (approximate)
const CA_BENCHMARKS = {
  housing:   { pct: 30, label: 'Housing' },
  food:      { pct: 14, label: 'Food' },
  transport: { pct: 13, label: 'Transport' },
  health:    { pct:  4, label: 'Health' },
  kids:      { pct:  5, label: 'Kids' },
  other:     { pct: 12, label: 'Other' },
  savings:   { pct: 10, label: 'Savings' },
  business:  { pct: null, label: 'Business' }, // no benchmark — varies too much
  income:    { pct: null, label: 'Income' },
}

function getDiff(yours, benchmark) {
  if (benchmark === null || yours === null) return null
  return +(yours - benchmark).toFixed(1)
}

function DiffBadge({ diff }) {
  if (diff === null) return <span style={styles.benchmarkNA}>No benchmark</span>
  if (Math.abs(diff) < 1.5) return (
    <span style={{ ...styles.badge, ...styles.badgeNeutral }}>
      <Minus size={10} style={{ marginRight: 3 }} />On par
    </span>
  )
  if (diff > 0) return (
    <span style={{ ...styles.badge, ...styles.badgeHigh }}>
      <TrendingUp size={10} style={{ marginRight: 3 }} />+{diff}% above avg
    </span>
  )
  return (
    <span style={{ ...styles.badge, ...styles.badgeLow }}>
      <TrendingDown size={10} style={{ marginRight: 3 }} />{diff}% below avg
    </span>
  )
}

function CompareBar({ yours, benchmark }) {
  if (benchmark === null) return null
  const max = Math.max(yours, benchmark, 5) * 1.2
  return (
    <div style={styles.compareWrap}>
      <div style={styles.compareTrack}>
        <div
          style={{
            ...styles.compareBar,
            width: `${(yours / max) * 100}%`,
            background: yours > benchmark + 3 ? '#ff6b6b' : yours < benchmark - 3 ? '#c8f264' : '#74b9ff',
          }}
        />
      </div>
      <div style={styles.benchmarkTrack}>
        <div style={{ ...styles.benchmarkBar, width: `${(benchmark / max) * 100}%` }} />
      </div>
    </div>
  )
}

export default function Spending() {
  const { transactions } = useApp()
  const [view, setView] = useState('all')

  const filtered = useMemo(() => {
    if (view === 'all') return transactions
    return transactions.filter(t => t.mode === view)
  }, [transactions, view])

  const { totalExpenses, byCategory } = useMemo(() => {
    const map = {}
    let total = 0
    filtered
      .filter(t => t.category !== 'income' && (t.amount_cad || 0) < 0)
      .forEach(t => {
        const cat = t.category || 'other'
        map[cat] = (map[cat] || 0) + Math.abs(t.amount_cad || 0)
        total += Math.abs(t.amount_cad || 0)
      })
    // also include savings as outflow
    filtered
      .filter(t => t.category === 'savings')
      .forEach(t => {
        const amt = Math.abs(t.amount_cad || 0)
        map['savings'] = (map['savings'] || 0) + amt
        total += amt
      })
    return { totalExpenses: total, byCategory: map }
  }, [filtered])

  const rows = useMemo(() => {
    return Object.entries(byCategory)
      .map(([cat, amount]) => {
        const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
        const benchmark = CA_BENCHMARKS[cat]?.pct ?? null
        const diff = getDiff(+pct.toFixed(1), benchmark)
        return { cat, amount, pct, benchmark, diff }
      })
      .sort((a, b) => b.amount - a.amount)
  }, [byCategory, totalExpenses])

  const pieData = rows.map(r => ({ name: r.cat, value: Math.round(r.amount) }))

  const fmtCAD = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const { name, value } = payload[0]
    const pct = totalExpenses > 0 ? ((value / totalExpenses) * 100).toFixed(1) : 0
    return (
      <div style={styles.tooltip}>
        <div style={{ color: CATEGORY_COLORS[name] || '#888', fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>{name}</div>
        <div style={{ color: '#e8e8e8' }}>{fmtCAD(value)}</div>
        <div style={{ color: '#555', fontSize: 12 }}>{pct}% of spending</div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Spending Breakdown</h2>
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

      {rows.length === 0 ? (
        <div style={styles.empty}>No expense data yet. Import transactions to see your spending breakdown.</div>
      ) : (
        <div style={styles.layout}>
          {/* Pie chart */}
          <div style={styles.chartCard}>
            <div style={styles.cardTitle}>By Category</div>
            <div style={styles.totalLabel}>Total spending</div>
            <div style={styles.totalValue}>{fmtCAD(totalExpenses)}</div>

            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#636e72'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div style={styles.legend}>
              {rows.map(r => (
                <div key={r.cat} style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, background: CATEGORY_COLORS[r.cat] || '#636e72' }} />
                  <span style={styles.legendCat}>{r.cat}</span>
                  <span style={styles.legendPct}>{r.pct.toFixed(1)}%</span>
                  <span style={styles.legendAmt}>{fmtCAD(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Benchmark comparison */}
          <div style={styles.benchmarkCard}>
            <div style={styles.cardTitle}>vs. Canadian Average</div>
            <div style={styles.benchmarkNote}>
              Based on Statistics Canada household spending data. Percentages are share of total outflows.
            </div>

            <div style={styles.legendKey}>
              <div style={styles.keyItem}>
                <div style={{ ...styles.keyDot, background: '#74b9ff' }} />
                <span>Your spending</span>
              </div>
              <div style={styles.keyItem}>
                <div style={{ ...styles.keyDot, background: '#333' }} />
                <span>Canadian average</span>
              </div>
            </div>

            <div style={styles.benchmarkList}>
              {rows.map(r => (
                <div key={r.cat} style={styles.benchmarkRow}>
                  <div style={styles.benchmarkTop}>
                    <div style={styles.benchmarkLeft}>
                      <span style={{ ...styles.catDot, background: CATEGORY_COLORS[r.cat] || '#636e72' }} />
                      <span style={styles.catName}>{r.cat.charAt(0).toUpperCase() + r.cat.slice(1)}</span>
                    </div>
                    <div style={styles.benchmarkRight}>
                      <span style={styles.yourPct}>{r.pct.toFixed(1)}%</span>
                      {r.benchmark !== null && (
                        <span style={styles.avgPct}>avg {r.benchmark}%</span>
                      )}
                      <DiffBadge diff={r.diff} />
                    </div>
                  </div>
                  <CompareBar yours={r.pct} benchmark={r.benchmark} />
                  <div style={styles.benchmarkAmount}>{fmtCAD(r.amount)}</div>
                </div>
              ))}
            </div>

            <div style={styles.disclaimer}>
              Averages are approximate. Canadian households vary significantly by income, region, and family size. Your province, income level, and whether you have kids will shift what "normal" looks like for you.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8' },
  viewToggle: {
    display: 'flex', gap: '4px', background: '#1e1e1e', borderRadius: '8px', padding: '4px',
  },
  toggleBtn: {
    padding: '6px 14px', border: 'none', borderRadius: '6px',
    background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer',
  },
  toggleBtnActive: { background: '#2a2a2a', color: '#e8e8e8' },
  empty: { color: '#555', fontSize: '13px', textAlign: 'center', padding: '80px 0' },
  layout: { display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px', alignItems: 'start' },
  chartCard: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px',
  },
  benchmarkCard: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px',
  },
  cardTitle: {
    fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '16px',
    color: '#e8e8e8', marginBottom: '4px', fontWeight: 400,
  },
  totalLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  totalValue: { fontSize: '24px', fontFamily: "'DM Serif Display', Georgia, serif", color: '#c8f264', marginBottom: '8px' },
  legend: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  legendCat: { fontSize: '12px', color: '#888', flex: 1, textTransform: 'capitalize' },
  legendPct: { fontSize: '12px', color: '#555', width: '42px', textAlign: 'right' },
  legendAmt: { fontSize: '12px', color: '#e8e8e8', width: '90px', textAlign: 'right' },
  tooltip: {
    background: '#1e1e1e', border: '1px solid #2a2a2a',
    borderRadius: '8px', padding: '10px 14px',
  },
  benchmarkNote: { fontSize: '12px', color: '#555', lineHeight: '1.5', marginBottom: '16px', marginTop: '4px' },
  legendKey: { display: 'flex', gap: '16px', marginBottom: '16px' },
  keyItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#555' },
  keyDot: { width: '10px', height: '4px', borderRadius: '2px' },
  benchmarkList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  benchmarkRow: { display: 'flex', flexDirection: 'column', gap: '6px' },
  benchmarkTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  benchmarkLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  catDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  catName: { fontSize: '13px', color: '#e8e8e8' },
  benchmarkRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  yourPct: { fontSize: '14px', color: '#e8e8e8', fontWeight: 500, minWidth: '38px', textAlign: 'right' },
  avgPct: { fontSize: '12px', color: '#555' },
  compareWrap: { display: 'flex', flexDirection: 'column', gap: '3px' },
  compareTrack: { height: '5px', background: '#1e1e1e', borderRadius: '3px', overflow: 'hidden' },
  compareBar: { height: '100%', borderRadius: '3px', transition: 'width 0.4s ease' },
  benchmarkTrack: { height: '3px', background: '#1e1e1e', borderRadius: '2px', overflow: 'hidden' },
  benchmarkBar: { height: '100%', background: '#333', borderRadius: '2px' },
  benchmarkAmount: { fontSize: '11px', color: '#555' },
  badge: {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500,
  },
  badgeHigh: { background: 'rgba(255,107,107,0.15)', color: '#ff6b6b' },
  badgeLow: { background: 'rgba(200,242,100,0.12)', color: '#c8f264' },
  badgeNeutral: { background: 'rgba(116,185,255,0.12)', color: '#74b9ff' },
  benchmarkNA: { fontSize: '11px', color: '#555' },
  disclaimer: {
    marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #2a2a2a',
    fontSize: '11px', color: '#555', lineHeight: '1.6',
  },
}
