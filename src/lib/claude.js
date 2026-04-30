const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-5'

export async function callClaude({ apiKey, system, messages, maxTokens = 1024 }) {
  if (!apiKey) throw new Error('No API key configured. Add your Anthropic key in Settings.')

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  return data.content[0].text
}

export function buildFinancialContext({ profile, accounts, transactions, usdCadRate }) {
  const totalIncomeCAD =
    (profile?.annual_income_cad || 0) +
    (profile?.annual_income_usd || 0) * usdCadRate

  const expenses = transactions
    .filter(t => t.category !== 'income' && t.category !== 'savings' && t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount_cad || 0), 0)

  const income = transactions
    .filter(t => t.category === 'income' || t.amount > 0)
    .reduce((s, t) => s + (t.amount_cad || 0), 0)

  const byCategory = {}
  transactions.forEach(t => {
    if (!byCategory[t.category]) byCategory[t.category] = 0
    byCategory[t.category] += Math.abs(t.amount_cad || 0)
  })

  const netWorth = accounts
    ? (accounts.tfsa_balance || 0) +
      (accounts.rrsp_balance || 0) +
      (accounts.resp_balance || 0) +
      (accounts.non_registered || 0) +
      (accounts.savings_cad || 0) +
      (accounts.savings_usd || 0) * usdCadRate
    : 0

  return `
USER FINANCIAL PROFILE:
- Name: ${profile?.name || 'User'}
- Province: ${profile?.province || 'BC'}
- Birth year: ${profile?.birth_year || 'unknown'} (age ~${profile?.birth_year ? new Date().getFullYear() - profile.birth_year : '?'})
- Annual income CAD: $${(profile?.annual_income_cad || 0).toLocaleString()}
- Annual income USD: $${(profile?.annual_income_usd || 0).toLocaleString()} (~$${Math.round((profile?.annual_income_usd || 0) * usdCadRate).toLocaleString()} CAD)
- Total annual income (CAD equiv): $${Math.round(totalIncomeCAD).toLocaleString()}
- Has kids: ${profile?.has_kids ? `Yes (ages: ${(profile.kids_ages || []).join(', ')})` : 'No'}

ACCOUNT BALANCES:
- TFSA: $${(accounts?.tfsa_balance || 0).toLocaleString()} (contribution room: $${(accounts?.tfsa_room || 0).toLocaleString()})
- RRSP: $${(accounts?.rrsp_balance || 0).toLocaleString()} (contribution room: $${(accounts?.rrsp_room || 0).toLocaleString()})
- RESP: $${(accounts?.resp_balance || 0).toLocaleString()} (contribution room: $${(accounts?.resp_room || 0).toLocaleString()})
- Non-registered: $${(accounts?.non_registered || 0).toLocaleString()}
- Savings CAD: $${(accounts?.savings_cad || 0).toLocaleString()}
- Savings USD: $${(accounts?.savings_usd || 0).toLocaleString()} (~$${Math.round((accounts?.savings_usd || 0) * usdCadRate).toLocaleString()} CAD)
- Net worth: ~$${Math.round(netWorth).toLocaleString()} CAD

TRANSACTION SUMMARY (loaded transactions):
- Total income: $${Math.round(income).toLocaleString()} CAD
- Total expenses: $${Math.round(expenses).toLocaleString()} CAD
- Net cash flow: $${Math.round(income - expenses).toLocaleString()} CAD
- Spending by category: ${Object.entries(byCategory).map(([k, v]) => `${k}: $${Math.round(v).toLocaleString()}`).join(', ')}
- Total transactions: ${transactions.length}

LIVE USD/CAD RATE: ${usdCadRate.toFixed(4)}
`
}
