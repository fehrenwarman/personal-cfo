import { useState, useRef, useMemo, useCallback } from 'react'
import Papa from 'papaparse'
import { useApp } from '../context/AppContext'
import { categorize, CATEGORIES } from '../lib/categories'
import { Upload, Search, Trash2, X } from 'lucide-react'

function parseDate(str) {
  if (!str) return new Date().toISOString().slice(0, 10)
  // Try common formats
  const d = new Date(str)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  // DD/MM/YYYY
  const parts = str.split(/[\/\-\.]/)
  if (parts.length === 3) {
    const attempt = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`)
    if (!isNaN(attempt)) return attempt.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

function detectColumns(headers) {
  const h = headers.map(s => s.toLowerCase().trim())
  const dateCol = h.findIndex(c => c.includes('date') || c.includes('time'))
  const descCol = h.findIndex(c => c.includes('desc') || c.includes('memo') || c.includes('narr') || c.includes('payee') || c.includes('name') || c.includes('detail'))
  const amtCol = h.findIndex(c => (c === 'amount' || c === 'amt' || c.includes('amount')))
  const debitCol = h.findIndex(c => c.includes('debit') || c === 'withdrawal' || c === 'dr')
  const creditCol = h.findIndex(c => c.includes('credit') || c === 'deposit' || c === 'cr')
  const currencyCol = h.findIndex(c => c === 'currency' || c === 'ccy' || c === 'curr')
  return { dateCol, descCol, amtCol, debitCol, creditCol, currencyCol }
}

function rowToTx(row, cols, headers, usdCadRate) {
  const get = (i) => (i >= 0 ? row[headers[i]] : '') || ''

  const dateStr = get(cols.dateCol)
  const date = parseDate(dateStr)
  const description = get(cols.descCol).trim() || 'Unknown'

  let amount = 0
  if (cols.amtCol >= 0) {
    const raw = get(cols.amtCol).replace(/[$,\s]/g, '')
    amount = parseFloat(raw) || 0
  } else if (cols.debitCol >= 0 || cols.creditCol >= 0) {
    const debit = parseFloat((get(cols.debitCol) || '0').replace(/[$,\s]/g, '')) || 0
    const credit = parseFloat((get(cols.creditCol) || '0').replace(/[$,\s]/g, '')) || 0
    amount = credit - debit
  }

  const currencyRaw = get(cols.currencyCol).toUpperCase()
  const currency = currencyRaw === 'USD' ? 'USD' : 'CAD'
  const amount_cad = currency === 'USD' ? amount * usdCadRate : amount
  const category = categorize(description)

  return { date, description, amount, currency, category, mode: 'personal', amount_cad }
}

export default function Transactions() {
  const { transactions, addTransactions, updateTransaction, clearTransactions, usdCadRate } = useApp()
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const fileRef = useRef()

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterMode !== 'all' && t.mode !== filterMode) return false
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (search) {
        const q = search.toLowerCase()
        return t.description?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q)
      }
      return true
    })
  }, [transactions, filterMode, filterCategory, search])

  async function processFile(file) {
    setImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const headers = results.meta.fields || []
        const cols = detectColumns(headers)
        const txs = results.data.map(row => rowToTx(row, cols, headers, usdCadRate))
        await addTransactions(txs)
        setImporting(false)
      },
      error: () => setImporting(false),
    })
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) processFile(file)
  }

  function onFileChange(e) {
    const file = e.target.files[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const toggleMode = useCallback(async (tx) => {
    const newMode = tx.mode === 'personal' ? 'business' : 'personal'
    await updateTransaction(tx.id, { mode: newMode })
  }, [updateTransaction])

  const changeCategory = useCallback(async (tx, category) => {
    await updateTransaction(tx.id, { category })
  }, [updateTransaction])

  const fmtCAD = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(n)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Transactions</h2>
        <button onClick={() => { if (window.confirm('Clear all transactions?')) clearTransactions() }} style={styles.clearBtn}>
          <Trash2 size={13} />
          Clear All
        </button>
      </div>

      {/* Drop zone */}
      <div
        style={{ ...styles.dropZone, ...(dragging ? styles.dropZoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={20} color="#555" />
        <div style={styles.dropText}>
          {importing ? 'Importing...' : 'Drop CSV here or click to upload'}
        </div>
        <div style={styles.dropSub}>Supports single amount column or separate debit/credit columns</div>
        <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: 'none' }} />
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <div style={styles.searchWrap}>
          <Search size={14} color="#555" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transactions..."
            style={styles.searchInput}
          />
          {search && (
            <button onClick={() => setSearch('')} style={styles.clearSearch}>
              <X size={12} />
            </button>
          )}
        </div>

        <select value={filterMode} onChange={e => setFilterMode(e.target.value)} style={styles.select}>
          <option value="all">All modes</option>
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>

        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={styles.select}>
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            {transactions.length === 0
              ? 'No transactions yet. Upload a CSV to get started.'
              : 'No transactions match your filters.'}
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Date', 'Description', 'Category', 'Mode', 'Currency', 'Amount (CAD)'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id} style={styles.tr}>
                  <td style={styles.td}>{tx.date}</td>
                  <td style={{ ...styles.td, ...styles.descCell }}>{tx.description}</td>
                  <td style={styles.td}>
                    <select
                      value={tx.category || 'other'}
                      onChange={e => changeCategory(tx, e.target.value)}
                      style={styles.catSelect}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => toggleMode(tx)}
                      style={{
                        ...styles.modeBadge,
                        ...(tx.mode === 'business' ? styles.modeBusiness : styles.modePersonal),
                      }}
                    >
                      {tx.mode === 'business' ? 'Business' : 'Personal'}
                    </button>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.currency}>{tx.currency}</span>
                  </td>
                  <td style={{ ...styles.td, ...styles.amountCell }}>
                    <span style={{ color: (tx.amount_cad || 0) >= 0 ? '#c8f264' : '#ff6b6b' }}>
                      {fmtCAD(tx.amount_cad || 0)}
                    </span>
                    {tx.currency === 'USD' && (
                      <div style={styles.rateNote}>
                        ${Math.abs(tx.amount).toFixed(2)} USD @ {usdCadRate.toFixed(4)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={styles.countNote}>{filtered.length} of {transactions.length} transactions</div>
    </div>
  )
}

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8' },
  clearBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '7px 14px', background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px',
    color: '#ff6b6b', fontSize: '13px', cursor: 'pointer',
  },
  dropZone: {
    border: '1.5px dashed #2a2a2a', borderRadius: '12px',
    padding: '40px', textAlign: 'center', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
    transition: 'border-color 0.15s, background 0.15s',
    background: '#161616',
  },
  dropZoneActive: {
    borderColor: '#c8f264', background: 'rgba(200,242,100,0.05)',
  },
  dropText: { color: '#888', fontSize: '14px' },
  dropSub: { color: '#555', fontSize: '12px' },
  filters: { display: 'flex', gap: '12px', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1 },
  searchInput: {
    width: '100%', padding: '8px 36px 8px 36px',
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#e8e8e8', fontSize: '13px', outline: 'none',
  },
  clearSearch: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px',
  },
  select: {
    padding: '8px 12px', background: '#161616',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#888', fontSize: '13px', cursor: 'pointer', outline: 'none',
  },
  tableWrap: { overflowX: 'auto', background: '#161616', borderRadius: '12px', border: '1px solid #2a2a2a' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px', textAlign: 'left',
    fontSize: '11px', color: '#555', letterSpacing: '0.05em', textTransform: 'uppercase',
    borderBottom: '1px solid #2a2a2a', fontWeight: 500,
  },
  tr: { borderBottom: '1px solid #1e1e1e' },
  td: { padding: '12px 16px', fontSize: '13px', color: '#e8e8e8', verticalAlign: 'middle' },
  descCell: { maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  catSelect: {
    padding: '4px 8px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '6px',
    color: '#888', fontSize: '12px', cursor: 'pointer', outline: 'none',
  },
  modeBadge: {
    padding: '3px 10px', borderRadius: '20px',
    fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none',
    letterSpacing: '0.02em',
  },
  modePersonal: { background: 'rgba(116,185,255,0.15)', color: '#74b9ff' },
  modeBusiness: { background: 'rgba(200,242,100,0.15)', color: '#c8f264' },
  currency: {
    padding: '2px 6px', borderRadius: '4px',
    background: '#1e1e1e', fontSize: '11px', color: '#555',
  },
  amountCell: { textAlign: 'right' },
  rateNote: { fontSize: '10px', color: '#555', marginTop: '2px' },
  countNote: { fontSize: '12px', color: '#555', textAlign: 'right' },
  empty: { padding: '48px', textAlign: 'center', color: '#555', fontSize: '13px' },
}
