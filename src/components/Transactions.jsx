import { useState, useRef, useMemo, useCallback } from 'react'
import Papa from 'papaparse'
import { useApp } from '../context/AppContext'
import { categorize, CATEGORIES } from '../lib/categories'
import { Upload, Search, Trash2, X, CheckCircle, RefreshCcw } from 'lucide-react'

// ── CSV helpers (used only when LunchMoney is NOT active) ────────────────────

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
  return {
    dateCol:     h.findIndex(c => c.includes('date') || c.includes('time')),
    descCol:     h.findIndex(c => c.includes('desc') || c.includes('memo') || c.includes('narr') || c.includes('payee') || c.includes('name') || c.includes('detail')),
    amtCol:      h.findIndex(c => c === 'amount' || c === 'amt' || c === 'transaction amount'),
    debitCol:    h.findIndex(c => c.includes('debit') || c === 'withdrawal' || c === 'dr'),
    creditCol:   h.findIndex(c => c.includes('credit') || c === 'deposit' || c === 'cr'),
    currencyCol: h.findIndex(c => c === 'currency' || c === 'ccy' || c === 'curr'),
    balanceCol:  h.findIndex(c => c === 'balance' || c.includes('balance')),
  }
}

function rowToTx(row, cols, headers, usdCadRate) {
  const get = i => (i >= 0 ? row[headers[i]] : '') || ''
  const date = parseDate(get(cols.dateCol))
  const description = get(cols.descCol).trim() || 'Unknown'
  let amount = 0
  if (cols.amtCol >= 0) {
    amount = parseFloat(get(cols.amtCol).replace(/[$,\s]/g, '')) || 0
  } else if (cols.debitCol >= 0 || cols.creditCol >= 0) {
    const debit  = parseFloat((get(cols.debitCol)  || '0').replace(/[$,\s]/g, '')) || 0
    const credit = parseFloat((get(cols.creditCol) || '0').replace(/[$,\s]/g, '')) || 0
    amount = credit - debit
  }
  const currency   = get(cols.currencyCol).toUpperCase() === 'USD' ? 'USD' : 'CAD'
  const amount_cad = currency === 'USD' ? amount * usdCadRate : amount
  return { date, description, amount, currency, category: categorize(description), mode: 'personal', amount_cad }
}

function extractBalance(results, cols) {
  if (cols.balanceCol < 0) return null
  for (const row of results.data) {
    const raw = (row[results.meta.fields[cols.balanceCol]] || '').replace(/[$,\s]/g, '')
    const val = parseFloat(raw)
    if (!isNaN(val)) return val
  }
  return null
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Transactions() {
  const {
    transactions, accounts,
    addTransactions, updateTransaction, clearTransactions, saveAccounts,
    usdCadRate, lmActive, lmSyncing, lmSyncedAt, lmError, triggerLmSync,
  } = useApp()

  const [dragging, setDragging]         = useState(false)
  const [importState, setImportState]   = useState(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [updateBalance, setUpdateBalance] = useState(true)
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [search, setSearch]             = useState('')
  const [filterMode, setFilterMode]     = useState('all')
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
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || []
        const cols    = detectColumns(headers)
        const txs     = results.data.map(row => rowToTx(row, cols, headers, usdCadRate))
        const balance = extractBalance(results, cols)
        const dates   = txs.map(t => t.date).sort()
        setImportState({ txs, balance, filename: file.name, dateRange: dates.length ? `${dates[0]} to ${dates[dates.length-1]}` : '' })
        setImportResult(null)
        if (bankAccounts.length === 1) setSelectedAccountId(bankAccounts[0].id)
        else setSelectedAccountId('')
      },
    })
  }

  async function confirmImport() {
    if (!importState) return
    setImporting(true)
    const { error, count } = await addTransactions(importState.txs)
    if (!error && updateBalance && selectedAccountId && importState.balance !== null) {
      const updated = bankAccounts.map(a => a.id === selectedAccountId ? { ...a, balance: importState.balance } : a)
      await saveAccounts({ ...accounts, bank_accounts: updated })
    }
    setImporting(false)
    setImportResult({ count, error })
    if (!error) setImportState(null)
  }

  const toggleMode = useCallback(async (tx) => {
    // For LunchMoney transactions, just update local state (no Supabase write)
    if (lmActive) return
    await updateTransaction(tx.id, { mode: tx.mode === 'personal' ? 'business' : 'personal' })
  }, [updateTransaction, lmActive])

  const changeCategory = useCallback(async (tx, category) => {
    if (lmActive) return
    await updateTransaction(tx.id, { category })
  }, [updateTransaction, lmActive])

  const fmtCAD = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(n)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Transactions</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {lmActive ? (
            <button onClick={triggerLmSync} disabled={lmSyncing} style={styles.syncBtn}>
              <RefreshCcw size={13} />
              {lmSyncing ? 'Syncing...' : 'Sync LunchMoney'}
            </button>
          ) : (
            <button onClick={() => { if (window.confirm('Clear all transactions?')) clearTransactions() }} style={styles.clearBtn}>
              <Trash2 size={13} />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* LunchMoney sync banner */}
      {lmActive && (
        <div style={lmError ? styles.lmBannerError : styles.lmBanner}>
          {lmError ? (
            <>LunchMoney sync error: {lmError}</>
          ) : lmSyncing ? (
            <>Syncing from LunchMoney...</>
          ) : lmSyncedAt ? (
            <><CheckCircle size={13} style={{ marginRight: 6 }} />Synced from LunchMoney · {transactions.length} transactions · Last {lmSyncedAt.toLocaleString()}</>
          ) : (
            <>Connected to LunchMoney</>
          )}
        </div>
      )}

      {/* CSV upload — only shown when LunchMoney is not active */}
      {!lmActive && !importState && (
        <div
          style={{ ...styles.dropZone, ...(dragging ? styles.dropZoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.csv')) parseFile(f) }}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={20} color="#555" />
          <div style={styles.dropText}>Drop a bank statement CSV here, or click to upload</div>
          <div style={styles.dropSub}>Supports single amount or separate debit/credit columns · Balance column auto-detected</div>
          <input ref={fileRef} type="file" accept=".csv" onChange={e => { const f = e.target.files[0]; if (f) parseFile(f); e.target.value = '' }} style={{ display: 'none' }} />
        </div>
      )}

      {/* CSV import confirmation */}
      {!lmActive && importState && (
        <div style={styles.importPanel}>
          <div style={styles.importHeader}>
            <div>
              <div style={styles.importTitle}>Review Import</div>
              <div style={styles.importSub}>{importState.filename} · {importState.txs.length} transactions{importState.dateRange ? ` · ${importState.dateRange}` : ''}</div>
            </div>
            <button onClick={() => { setImportState(null); setImportResult(null) }} style={styles.xBtn}><X size={14} /></button>
          </div>
          {importState.balance !== null && (
            <div style={styles.detectedBalance}>Detected closing balance: <strong style={{ color: '#c8f264' }}>{fmtCAD(importState.balance)}</strong></div>
          )}
          {bankAccounts.length > 0 && (
            <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} style={styles.accountSelect}>
              <option value="">Don't link to an account</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {selectedAccountId && importState.balance !== null && (
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={updateBalance} onChange={e => setUpdateBalance(e.target.checked)} style={{ marginRight: 8 }} />
              Update {bankAccounts.find(a => a.id === selectedAccountId)?.name} balance to {fmtCAD(importState.balance)}
            </label>
          )}
          <div style={styles.importActions}>
            <button onClick={() => setImportState(null)} style={styles.cancelTextBtn}>Cancel</button>
            <button onClick={confirmImport} disabled={importing} style={styles.confirmBtn}>
              <CheckCircle size={14} />
              {importing ? 'Importing...' : `Import ${importState.txs.length} transactions`}
            </button>
          </div>
          {importResult?.error && <div style={styles.importError}>{importResult.error}</div>}
        </div>
      )}

      {importResult && !importResult.error && (
        <div style={styles.successBanner}><CheckCircle size={13} style={{ marginRight: 6 }} />{importResult.count} transactions imported.</div>
      )}

      {/* Filters */}
      <div style={styles.filters}>
        <div style={styles.searchWrap}>
          <Search size={14} color="#555" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions..." style={styles.searchInput} />
          {search && <button onClick={() => setSearch('')} style={styles.clearSearch}><X size={12} /></button>}
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
            {lmActive
              ? lmSyncing ? 'Syncing from LunchMoney...'
              : transactions.length === 0 ? 'No transactions synced yet. Check your LunchMoney API token in Settings.'
              : 'No transactions match your filters.'
              : transactions.length === 0 ? 'No transactions yet. Upload a CSV or connect LunchMoney in Settings.'
              : 'No transactions match your filters.'
            }
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Date', 'Description', lmActive ? 'LM Category' : 'Category', 'Mode', 'Currency', 'Amount (CAD)'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id} style={styles.tr}>
                  <td style={styles.td}>{tx.date}</td>
                  <td style={{ ...styles.td, ...styles.descCell }}>
                    {tx.description}
                    {tx.account_name && <div style={styles.accountLabel}>{tx.account_name}</div>}
                  </td>
                  <td style={styles.td}>
                    {lmActive ? (
                      <span style={styles.lmCat}>{tx.lm_category || tx.category}</span>
                    ) : (
                      <select value={tx.category || 'other'} onChange={e => changeCategory(tx, e.target.value)} style={styles.catSelect}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.modeBadge, ...(tx.mode === 'business' ? styles.modeBusiness : styles.modePersonal) }}>
                      {tx.mode === 'business' ? 'Business' : 'Personal'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.currency}>{tx.currency}</span>
                  </td>
                  <td style={{ ...styles.td, ...styles.amountCell }}>
                    <span style={{ color: (tx.amount_cad || 0) >= 0 ? '#c8f264' : '#ff6b6b' }}>
                      {fmtCAD(tx.amount_cad || 0)}
                    </span>
                    {tx.currency === 'USD' && (
                      <div style={styles.rateNote}>${Math.abs(tx.amount).toFixed(2)} USD @ {usdCadRate.toFixed(4)}</div>
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
  syncBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'rgba(200,242,100,0.1)', border: '1px solid rgba(200,242,100,0.3)', borderRadius: '8px', color: '#c8f264', fontSize: '13px', cursor: 'pointer' },
  clearBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px', color: '#ff6b6b', fontSize: '13px', cursor: 'pointer' },
  lmBanner: { display: 'flex', alignItems: 'center', padding: '10px 14px', background: 'rgba(200,242,100,0.08)', border: '1px solid rgba(200,242,100,0.2)', borderRadius: '8px', fontSize: '12px', color: '#c8f264' },
  lmBannerError: { padding: '10px 14px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px', fontSize: '12px', color: '#ff6b6b' },
  dropZone: { border: '1.5px dashed #2a2a2a', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: '#161616', transition: 'border-color 0.15s' },
  dropZoneActive: { borderColor: '#c8f264', background: 'rgba(200,242,100,0.05)' },
  dropText: { color: '#888', fontSize: '14px' },
  dropSub: { color: '#555', fontSize: '12px' },
  importPanel: { background: '#161616', border: '1px solid rgba(200,242,100,0.25)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  importHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  importTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '17px', color: '#e8e8e8' },
  importSub: { fontSize: '12px', color: '#555', marginTop: '2px' },
  xBtn: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px' },
  detectedBalance: { fontSize: '13px', color: '#888', padding: '8px 12px', background: '#1e1e1e', borderRadius: '8px', border: '1px solid #2a2a2a' },
  accountSelect: { padding: '9px 13px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e8e8e8', fontSize: '13px', outline: 'none', cursor: 'pointer' },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: '13px', color: '#888', cursor: 'pointer' },
  importActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  cancelTextBtn: { padding: '8px 16px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#555', fontSize: '13px', cursor: 'pointer' },
  confirmBtn: { display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', background: '#c8f264', border: 'none', borderRadius: '8px', color: '#0f0f0f', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  importError: { padding: '10px 14px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px', color: '#ff6b6b', fontSize: '13px' },
  successBanner: { display: 'flex', alignItems: 'center', padding: '10px 14px', background: 'rgba(200,242,100,0.1)', border: '1px solid rgba(200,242,100,0.3)', borderRadius: '8px', color: '#c8f264', fontSize: '13px' },
  filters: { display: 'flex', gap: '12px', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1 },
  searchInput: { width: '100%', padding: '8px 36px', background: '#161616', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e8e8e8', fontSize: '13px', outline: 'none' },
  clearSearch: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px' },
  select: { padding: '8px 12px', background: '#161616', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#888', fontSize: '13px', cursor: 'pointer', outline: 'none' },
  tableWrap: { overflowX: 'auto', background: '#161616', borderRadius: '12px', border: '1px solid #2a2a2a' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: '#555', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #2a2a2a', fontWeight: 500 },
  tr: { borderBottom: '1px solid #1e1e1e' },
  td: { padding: '12px 16px', fontSize: '13px', color: '#e8e8e8', verticalAlign: 'middle' },
  descCell: { maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  accountLabel: { fontSize: '11px', color: '#555', marginTop: '2px' },
  lmCat: { fontSize: '12px', color: '#888' },
  catSelect: { padding: '4px 8px', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#888', fontSize: '12px', cursor: 'pointer', outline: 'none' },
  modeBadge: { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none' },
  modePersonal: { background: 'rgba(116,185,255,0.15)', color: '#74b9ff' },
  modeBusiness: { background: 'rgba(200,242,100,0.15)', color: '#c8f264' },
  currency: { padding: '2px 6px', borderRadius: '4px', background: '#1e1e1e', fontSize: '11px', color: '#555' },
  amountCell: { textAlign: 'right' },
  rateNote: { fontSize: '10px', color: '#555', marginTop: '2px' },
  countNote: { fontSize: '12px', color: '#555', textAlign: 'right' },
  empty: { padding: '48px', textAlign: 'center', color: '#555', fontSize: '13px' },
}
