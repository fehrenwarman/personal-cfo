import { useState, useRef, useMemo, useCallback } from 'react'
import Papa from 'papaparse'
import { useApp } from '../context/AppContext'
import { categorize, CATEGORIES } from '../lib/categories'
import { Upload, Search, Trash2, X, CheckCircle, BanknoteIcon } from 'lucide-react'

function parseDate(str) {
  if (!str) return new Date().toISOString().slice(0, 10)
  const d = new Date(str)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  const parts = str.split(/[\/\-\.]/)
  if (parts.length === 3) {
    const attempt = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`)
    if (!isNaN(attempt)) return attempt.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

function detectColumns(headers) {
  const h = headers.map(s => s.toLowerCase().trim())
  const dateCol    = h.findIndex(c => c.includes('date') || c.includes('time'))
  const descCol    = h.findIndex(c => c.includes('desc') || c.includes('memo') || c.includes('narr') || c.includes('payee') || c.includes('name') || c.includes('detail'))
  const amtCol     = h.findIndex(c => c === 'amount' || c === 'amt' || c === 'transaction amount')
  const debitCol   = h.findIndex(c => c.includes('debit') || c === 'withdrawal' || c === 'dr')
  const creditCol  = h.findIndex(c => c.includes('credit') || c === 'deposit' || c === 'cr')
  const currencyCol = h.findIndex(c => c === 'currency' || c === 'ccy' || c === 'curr')
  const balanceCol = h.findIndex(c => c === 'balance' || c === 'running balance' || c === 'account balance' || c.includes('balance'))
  return { dateCol, descCol, amtCol, debitCol, creditCol, currencyCol, balanceCol }
}

function rowToTx(row, cols, headers, usdCadRate) {
  const get = i => (i >= 0 ? row[headers[i]] : '') || ''

  const date        = parseDate(get(cols.dateCol))
  const description = get(cols.descCol).trim() || 'Unknown'

  let amount = 0
  if (cols.amtCol >= 0) {
    amount = parseFloat(get(cols.amtCol).replace(/[$,\s]/g, '')) || 0
  } else if (cols.debitCol >= 0 || cols.creditCol >= 0) {
    const debit  = parseFloat((get(cols.debitCol)  || '0').replace(/[$,\s]/g, '')) || 0
    const credit = parseFloat((get(cols.creditCol) || '0').replace(/[$,\s]/g, '')) || 0
    amount = credit - debit
  }

  const currencyRaw = get(cols.currencyCol).toUpperCase()
  const currency    = currencyRaw === 'USD' ? 'USD' : 'CAD'
  const amount_cad  = currency === 'USD' ? amount * usdCadRate : amount
  const category    = categorize(description)

  return { date, description, amount, currency, category, mode: 'personal', amount_cad }
}

function extractBalance(results, cols) {
  if (cols.balanceCol < 0) return null
  const headers = results.meta.fields
  // Find the most recent row (try first and last row, pick one that has a valid balance)
  for (const row of results.data) {
    const raw = (row[headers[cols.balanceCol]] || '').replace(/[$,\s]/g, '')
    const val = parseFloat(raw)
    if (!isNaN(val)) {
      // Return last valid balance found (last row = most recent after sort)
      return val
    }
  }
  return null
}

function getDateRange(txs) {
  if (!txs.length) return ''
  const dates = txs.map(t => t.date).sort()
  return `${dates[0]} to ${dates[dates.length - 1]}`
}

export default function Transactions() {
  const { transactions, accounts, addTransactions, updateTransaction, clearTransactions, saveAccounts, usdCadRate } = useApp()
  const [dragging, setDragging]       = useState(false)
  const [importState, setImportState] = useState(null) // { txs, balance, dateRange, filename }
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [updateBalance, setUpdateBalance] = useState(true)
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState(null) // { count }
  const [search, setSearch]           = useState('')
  const [filterMode, setFilterMode]   = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const fileRef = useRef()

  const bankAccounts = accounts?.bank_accounts || []

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

  function parseFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers  = results.meta.fields || []
        const cols     = detectColumns(headers)
        const txs      = results.data.map(row => rowToTx(row, cols, headers, usdCadRate))
        const balance  = extractBalance(results, cols)
        const dateRange = getDateRange(txs)

        setImportState({ txs, balance, dateRange, filename: file.name })
        setImportResult(null)
        // Pre-select account if only one exists
        if (bankAccounts.length === 1) setSelectedAccountId(bankAccounts[0].id)
        else setSelectedAccountId('')
      },
    })
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) parseFile(file)
  }

  function onFileChange(e) {
    const file = e.target.files[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!importState) return
    setImporting(true)

    const { error, count } = await addTransactions(importState.txs)

    // Update account balance if user chose to
    if (!error && updateBalance && selectedAccountId && importState.balance !== null) {
      const updated = bankAccounts.map(a =>
        a.id === selectedAccountId ? { ...a, balance: importState.balance } : a
      )
      await saveAccounts({ ...accounts, bank_accounts: updated })
    }

    setImporting(false)
    setImportResult({ count, error })
    if (!error) setImportState(null)
  }

  function cancelImport() {
    setImportState(null)
    setImportResult(null)
  }

  const toggleMode = useCallback(async (tx) => {
    await updateTransaction(tx.id, { mode: tx.mode === 'personal' ? 'business' : 'personal' })
  }, [updateTransaction])

  const changeCategory = useCallback(async (tx, category) => {
    await updateTransaction(tx.id, { category })
  }, [updateTransaction])

  const fmtCAD = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(n)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Transactions</h2>
        <button
          onClick={() => { if (window.confirm('Clear all transactions?')) clearTransactions() }}
          style={styles.clearBtn}
        >
          <Trash2 size={13} />
          Clear All
        </button>
      </div>

      {/* Drop zone — hide when reviewing a parsed file */}
      {!importState && (
        <div
          style={{ ...styles.dropZone, ...(dragging ? styles.dropZoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={20} color="#555" />
          <div style={styles.dropText}>Drop a bank statement CSV here, or click to upload</div>
          <div style={styles.dropSub}>
            Supports single amount column or separate debit/credit · Balance column auto-detected
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: 'none' }} />
        </div>
      )}

      {/* Import confirmation panel */}
      {importState && (
        <div style={styles.importPanel}>
          <div style={styles.importHeader}>
            <div>
              <div style={styles.importTitle}>Review Import</div>
              <div style={styles.importSub}>{importState.filename}</div>
            </div>
            <button onClick={cancelImport} style={styles.cancelBtn}><X size={14} /></button>
          </div>

          <div style={styles.importStats}>
            <Stat label="Transactions" value={importState.txs.length} />
            <Stat label="Date range" value={importState.dateRange || 'Unknown'} />
            {importState.balance !== null && (
              <Stat label="Detected balance" value={fmtCAD(importState.balance)} accent />
            )}
          </div>

          {/* Account linking */}
          <div style={styles.importSection}>
            <div style={styles.importSectionLabel}>
              <BanknoteIcon size={13} style={{ marginRight: 6 }} />
              Link to a bank account (optional)
            </div>

            {bankAccounts.length === 0 ? (
              <div style={styles.noAccounts}>
                No bank accounts set up yet. Go to the Accounts tab to add them first, then come back to import.
              </div>
            ) : (
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                style={styles.accountSelect}
              >
                <option value="">Don't link to an account</option>
                {bankAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                ))}
              </select>
            )}
          </div>

          {/* Update balance option */}
          {selectedAccountId && importState.balance !== null && (
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={updateBalance}
                onChange={e => setUpdateBalance(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Update <strong style={{ color: '#e8e8e8' }}>
                {bankAccounts.find(a => a.id === selectedAccountId)?.name}
              </strong> balance to {fmtCAD(importState.balance)}
            </label>
          )}

          {selectedAccountId && importState.balance === null && (
            <div style={styles.noBalanceNote}>
              No balance column detected in this CSV. The account balance won't be updated automatically — you can set it manually in the Accounts tab.
            </div>
          )}

          <div style={styles.importActions}>
            <button onClick={cancelImport} style={styles.cancelTextBtn}>Cancel</button>
            <button onClick={confirmImport} disabled={importing} style={styles.confirmBtn}>
              <CheckCircle size={14} />
              {importing ? 'Importing...' : `Import ${importState.txs.length} transactions`}
            </button>
          </div>

          {importResult?.error && (
            <div style={styles.importError}>Import failed: {importResult.error}</div>
          )}
        </div>
      )}

      {/* Success banner */}
      {importResult && !importResult.error && (
        <div style={styles.successBanner}>
          <CheckCircle size={14} />
          {importResult.count} transactions imported successfully.
          {updateBalance && selectedAccountId ? ' Account balance updated.' : ''}
        </div>
      )}

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
            <button onClick={() => setSearch('')} style={styles.clearSearch}><X size={12} /></button>
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

function Stat({ label, value, accent }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: accent ? '#c8f264' : '#e8e8e8' }}>{value}</div>
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
    border: '1.5px dashed #2a2a2a', borderRadius: '12px', padding: '40px',
    textAlign: 'center', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
    background: '#161616', transition: 'border-color 0.15s, background 0.15s',
  },
  dropZoneActive: { borderColor: '#c8f264', background: 'rgba(200,242,100,0.05)' },
  dropText: { color: '#888', fontSize: '14px' },
  dropSub: { color: '#555', fontSize: '12px' },

  // Import panel
  importPanel: {
    background: '#161616', border: '1px solid rgba(200,242,100,0.25)',
    borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
  },
  importHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  importTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '18px', color: '#e8e8e8' },
  importSub: { fontSize: '12px', color: '#555', marginTop: '2px' },
  cancelBtn: {
    background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '4px',
  },
  importStats: { display: 'flex', gap: '16px' },
  statBox: {
    background: '#1e1e1e', borderRadius: '8px', padding: '12px 16px',
    border: '1px solid #2a2a2a', flex: 1,
  },
  statLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' },
  statValue: { fontSize: '16px', fontFamily: "'DM Serif Display', Georgia, serif" },
  importSection: { display: 'flex', flexDirection: 'column', gap: '8px' },
  importSectionLabel: {
    fontSize: '12px', color: '#555', display: 'flex', alignItems: 'center',
  },
  noAccounts: {
    padding: '12px', background: '#1e1e1e', borderRadius: '8px',
    fontSize: '12px', color: '#555', border: '1px solid #2a2a2a',
  },
  accountSelect: {
    width: '100%', padding: '9px 13px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#e8e8e8', fontSize: '13px', outline: 'none', cursor: 'pointer',
  },
  checkLabel: {
    display: 'flex', alignItems: 'center', fontSize: '13px', color: '#888', cursor: 'pointer',
  },
  noBalanceNote: {
    fontSize: '12px', color: '#555', padding: '10px 14px',
    background: '#1e1e1e', borderRadius: '8px', border: '1px solid #2a2a2a',
  },
  importActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  cancelTextBtn: {
    padding: '9px 18px', background: 'transparent',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#555', fontSize: '13px', cursor: 'pointer',
  },
  confirmBtn: {
    display: 'flex', alignItems: 'center', gap: '7px',
    padding: '9px 18px', background: '#c8f264',
    border: 'none', borderRadius: '8px',
    color: '#0f0f0f', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  importError: {
    padding: '10px 14px', background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px',
    color: '#ff6b6b', fontSize: '13px',
  },
  successBanner: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '12px 16px', background: 'rgba(200,242,100,0.1)',
    border: '1px solid rgba(200,242,100,0.3)', borderRadius: '10px',
    color: '#c8f264', fontSize: '13px',
  },

  // Filters
  filters: { display: 'flex', gap: '12px', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1 },
  searchInput: {
    width: '100%', padding: '8px 36px',
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

  // Table
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
  },
  modePersonal: { background: 'rgba(116,185,255,0.15)', color: '#74b9ff' },
  modeBusiness: { background: 'rgba(200,242,100,0.15)', color: '#c8f264' },
  currency: { padding: '2px 6px', borderRadius: '4px', background: '#1e1e1e', fontSize: '11px', color: '#555' },
  amountCell: { textAlign: 'right' },
  rateNote: { fontSize: '10px', color: '#555', marginTop: '2px' },
  countNote: { fontSize: '12px', color: '#555', textAlign: 'right' },
  empty: { padding: '48px', textAlign: 'center', color: '#555', fontSize: '13px' },
}
