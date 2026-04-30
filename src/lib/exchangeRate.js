const CACHE_KEY = 'usd_cad_rate'
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours in ms

export async function getUsdCadRate() {
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached) {
    try {
      const { rate, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_TTL) {
        return rate
      }
    } catch {
      // invalid cache, fall through
    }
  }

  const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CAD')
  const data = await res.json()
  const rate = data.rates.CAD

  localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, timestamp: Date.now() }))
  return rate
}

export function clearRateCache() {
  localStorage.removeItem(CACHE_KEY)
}
