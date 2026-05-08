const LM_BASE = 'https://dev.lunchmoney.app/v1'

async function lmFetch(endpoint, apiKey) {
  const res = await fetch(`${LM_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `LunchMoney API error ${res.status}`)
  }
  return res.json()
}

// Fetch last N months of transactions (including tags for business detection)
export async function fetchLMTransactions(apiKey, months = 6) {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - months)

  const startStr = start.toISOString().slice(0, 10)
  const endStr   = end.toISOString().slice(0, 10)

  const data = await lmFetch(
    `/transactions?start_date=${startStr}&end_date=${endStr}&limit=1000&debit_as_negative=true`,
    apiKey
  )
  return data.transactions || []
}

// Detect if a LunchMoney transaction is business.
// businessGroup: the exact category group name the user configured (e.g. "Corporation")
export function detectMode(tx, businessGroup) {
  const group    = (tx.category_group_name || '').toLowerCase().trim()
  const category = (tx.category_name || '').toLowerCase().trim()
  const tags     = Array.isArray(tx.tags) ? tx.tags.map(t => (t.name || '').toLowerCase()) : []

  // 1. Match against user-configured business group name
  if (businessGroup) {
    const bg = businessGroup.toLowerCase().trim()
    if (group === bg || group.includes(bg)) return 'business'
  }

  // 2. Common business group/category keywords as fallback
  const businessKeywords = ['business', 'corp', 'corporation', 'company', 'work expense', 'professional', 'freelance', 'self-employed', 'llc', 'inc']
  if (businessKeywords.some(k => group.includes(k) || category.includes(k))) return 'business'

  // 3. Tags
  if (tags.some(t => businessKeywords.some(k => t.includes(k)))) return 'business'

  return 'personal'
}

// Fetch all account balances (Plaid-linked + manual assets)
export async function fetchLMAccounts(apiKey) {
  const [assetsData, plaidData] = await Promise.all([
    lmFetch('/assets', apiKey),
    lmFetch('/plaid_accounts', apiKey).catch(() => ({ plaid_accounts: [] })),
  ])
  return {
    assets: assetsData.assets || [],
    plaidAccounts: plaidData.plaid_accounts || [],
  }
}

// Map LunchMoney category name → our internal category key
function mapCategory(lmCategory) {
  if (!lmCategory) return 'other'
  const c = lmCategory.toLowerCase()
  if (c.includes('income') || c.includes('paycheck') || c.includes('salary') || c.includes('payroll') || c.includes('revenue')) return 'income'
  if (c.includes('rent') || c.includes('mortgage') || c.includes('housing') || c.includes('utilities') || c.includes('hydro') || c.includes('electric') || c.includes('internet') || c.includes('home')) return 'housing'
  if (c.includes('groceries') || c.includes('grocery') || c.includes('restaurant') || c.includes('dining') || c.includes('food') || c.includes('coffee') || c.includes('cafe')) return 'food'
  if (c.includes('transport') || c.includes('auto') || c.includes('gas') || c.includes('uber') || c.includes('transit') || c.includes('parking') || c.includes('car')) return 'transport'
  if (c.includes('health') || c.includes('medical') || c.includes('pharmacy') || c.includes('dental') || c.includes('doctor') || c.includes('fitness')) return 'health'
  if (c.includes('kid') || c.includes('child') || c.includes('school') || c.includes('education') || c.includes('daycare') || c.includes('tuition')) return 'kids'
  if (c.includes('business') || c.includes('office') || c.includes('software') || c.includes('subscript') || c.includes('saas') || c.includes('professional')) return 'business'
  if (c.includes('saving') || c.includes('invest') || c.includes('transfer') || c.includes('rrsp') || c.includes('tfsa') || c.includes('resp')) return 'savings'
  return 'other'
}

// Convert LunchMoney transactions to our internal format
// accountModes: { [lm_account_id]: 'personal' | 'business' } — set in Accounts tab
// businessGroup: category group name the user flagged as business (e.g. "Corporation")
export function mapLMTransactions(lmTxs, usdCadRate, businessGroup, accountModes = {}, defaultMode = null) {
  return lmTxs
    .filter(tx => tx.status !== 'pending')
    .map(tx => {
      const amount     = parseFloat(tx.amount) || 0
      const currency   = (tx.currency || 'cad').toUpperCase() === 'USD' ? 'USD' : 'CAD'
      const amount_cad = currency === 'USD' ? amount * usdCadRate : amount

      // Priority: account-level toggle > defaultMode from key source > category/keyword detection
      const lmAccountId = String(tx.plaid_account_id || tx.asset_id || '')
      const mode = accountModes[lmAccountId] || defaultMode || detectMode(tx, businessGroup)

      return {
        id:           String(tx.id),
        date:         tx.date,
        description:  tx.payee || tx.notes || 'Unknown',
        amount,
        currency,
        category:     mapCategory(tx.category_name),
        lm_category:  tx.category_name || 'Uncategorized',
        lm_group:     tx.category_group_name || '',
        lm_account_id: lmAccountId,
        mode,
        amount_cad,
        account_name: tx.account_display_name || '',
      }
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

// Convert LunchMoney accounts to our bank_accounts format
export function mapLMAccounts(assets, plaidAccounts) {
  const result = []

  plaidAccounts.forEach(a => {
    const isCredit = a.type === 'credit' || a.type === 'loan'
    const type     = isCredit ? 'credit' : a.subtype === 'savings' ? 'savings' : 'chequing'
    const balance  = parseFloat(a.balance) || 0

    result.push({
      id:       String(a.id),
      name:     a.display_name || a.name,
      type,
      balance:  isCredit ? -Math.abs(balance) : balance,
      currency: (a.currency || 'CAD').toUpperCase(),
      source:   'plaid',
      institution: a.institution_name || '',
    })
  })

  assets.forEach(a => {
    const typeName = a.type_name || ''
    // Skip investment/crypto — those go in the manual investment section
    if (['investment', 'cryptocurrency', 'employee_compensation', 'brokerage'].includes(typeName)) return

    const isLiability = ['credit', 'loan', 'other_liability'].includes(typeName)
    const type        = isLiability ? (typeName === 'loan' ? 'loc' : 'credit') : typeName === 'cash' ? 'chequing' : 'savings'
    const balance     = parseFloat(a.balance) || 0

    result.push({
      id:       String(a.id),
      name:     a.display_name || a.name,
      type,
      balance:  isLiability ? -Math.abs(balance) : balance,
      currency: (a.currency || 'CAD').toUpperCase(),
      source:   'lm_asset',
    })
  })

  return result
}
