export const CATEGORIES = [
  'income',
  'housing',
  'food',
  'transport',
  'health',
  'kids',
  'business',
  'savings',
  'other',
]

const KEYWORDS = {
  income: ['salary', 'payroll', 'deposit', 'income', 'transfer in', 'direct deposit', 'pay ', 'payment received', 'revenue', 'refund'],
  housing: ['rent', 'mortgage', 'strata', 'hydro', 'electricity', 'gas ', 'water ', 'internet', 'cable', 'insurance', 'maintenance', 'repair', 'furnit'],
  food: ['grocery', 'groceries', 'superstore', 'safeway', 'loblaws', 'costco', 'whole foods', 'save-on', 'sobeys', 'restaurant', 'cafe', 'coffee', 'starbucks', 'tim horton', 'mcdonald', 'pizza', 'sushi', 'doordash', 'uber eats', 'skip', 'instacart', 'food'],
  transport: ['gas station', 'petro', 'shell', 'esso', 'chevron', 'uber', 'lyft', 'taxi', 'transit', 'translink', 'parking', 'car wash', 'auto ', 'vehicle', 'insurance auto', 'icbc', 'dealership', 'mechanic', 'tire'],
  health: ['pharmacy', 'shoppers', 'rexall', 'london drugs', 'doctor', 'dental', 'optom', 'physio', 'massage', 'medical', 'hospital', 'clinic', 'health', 'drug'],
  kids: ['school', 'daycare', 'childcare', 'toys', 'children', 'kids', 'baby', 'diaper', 'sport', 'camp ', 'tutor'],
  business: ['office', 'software', 'subscription', 'aws', 'google cloud', 'azure', 'adobe', 'zoom', 'slack', 'notion', 'domain', 'hosting', 'invoice', 'client', 'contractor', 'business'],
  savings: ['transfer', 'savings', 'invest', 'rrsp', 'tfsa', 'resp', 'etf', 'mutual fund', 'wealthsimple', 'questrade', 'td direct'],
}

export function categorize(description) {
  if (!description) return 'other'
  const lower = description.toLowerCase()
  for (const [cat, keys] of Object.entries(KEYWORDS)) {
    if (keys.some(k => lower.includes(k))) return cat
  }
  return 'other'
}

export const CATEGORY_COLORS = {
  income: '#c8f264',
  housing: '#74b9ff',
  food: '#ffd166',
  transport: '#fd79a8',
  health: '#a29bfe',
  kids: '#55efc4',
  business: '#fdcb6e',
  savings: '#00cec9',
  other: '#636e72',
}
