import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getUsdCadRate, clearRateCache } from '../lib/exchangeRate'
import { fetchLMTransactions, fetchLMAccounts, mapLMTransactions, mapLMAccounts } from '../lib/lunchmoney'

const AppContext = createContext(null)

const DEFAULT_ACCOUNTS = {
  tfsa_balance: 0, tfsa_room: 0,
  rrsp_balance: 0, rrsp_room: 0,
  resp_balance: 0, resp_room: 0,
  non_registered: 0,
  savings_cad: 0,
  savings_usd: 0,
  bank_accounts: [],
}

async function ensureRow(table, userId, defaults = {}) {
  await supabase.from(table).upsert(
    { user_id: userId, ...defaults, updated_at: new Date().toISOString() },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
}

export function AppProvider({ children }) {
  const [session, setSession]     = useState(null)
  const [loading, setLoading]     = useState(true)

  const [profile, setProfile]           = useState(null)
  const [accounts, setAccounts]         = useState(null)
  const [transactions, setTransactions] = useState([])
  const [settings, setSettings]         = useState(null)
  const [chatHistory, setChatHistory]   = useState([])

  const [usdCadRate, setUsdCadRate] = useState(1.38)
  const [rateLoading, setRateLoading] = useState(false)

  const [lmSyncing, setLmSyncing]   = useState(false)
  const [lmSyncedAt, setLmSyncedAt] = useState(null)
  const [lmError, setLmError]       = useState(null)

  const [activeTab, setActiveTab] = useState('overview')

  // Derived: whether LunchMoney is configured
  const lmActive = Boolean(settings?.lunchmoney_key)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setRateLoading(true)
    getUsdCadRate()
      .then(r => setUsdCadRate(r))
      .catch(() => {})
      .finally(() => setRateLoading(false))
  }, [])

  useEffect(() => {
    if (session?.user) loadAllData(session.user.id)
    else if (!session) {
      setProfile(null); setAccounts(null)
      setTransactions([]); setSettings(null); setChatHistory([])
    }
  }, [session])

  async function loadAllData(userId) {
    await Promise.all([
      ensureRow('profiles', userId),
      ensureRow('accounts', userId, { data: DEFAULT_ACCOUNTS }),
      ensureRow('settings', userId),
      ensureRow('chat_history', userId, { messages: [] }),
    ])

    const [profileRes, accountsRes, settingsRes, chatRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('accounts').select('*').eq('user_id', userId).single(),
      supabase.from('settings').select('*').eq('user_id', userId).single(),
      supabase.from('chat_history').select('*').eq('user_id', userId).single(),
    ])

    const profileData  = profileRes.data || null
    const accountsData = accountsRes.data?.data || DEFAULT_ACCOUNTS
    const settingsData = settingsRes.data || null
    const chatData     = chatRes.data?.messages || []

    setProfile(profileData)
    setSettings(settingsData)
    setChatHistory(chatData)

    if (settingsData?.lunchmoney_key) {
      // LunchMoney active — merge LM bank accounts with manual investment accounts
      await syncFromLunchMoney(settingsData.lunchmoney_key, accountsData)
    } else {
      // No LunchMoney — load Supabase transactions and accounts normally
      setAccounts(accountsData)
      const txRes = await supabase
        .from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false })
      if (txRes.data) setTransactions(txRes.data)
    }
  }

  const syncFromLunchMoney = useCallback(async (lmKey, investmentAccounts) => {
    setLmSyncing(true)
    setLmError(null)
    try {
      const rate = await getUsdCadRate().catch(() => 1.38)

      const [lmTxs, { assets, plaidAccounts }] = await Promise.all([
        fetchLMTransactions(lmKey, 6),
        fetchLMAccounts(lmKey),
      ])

      const mappedTxs       = mapLMTransactions(lmTxs, rate)
      const mappedBankAccts = mapLMAccounts(assets, plaidAccounts)

      // Apply manual overrides on top of LM auto-detected modes
      // (auto-detection uses category_group_name/tags; manual toggle wins if set)
      const txModes = investmentAccounts.tx_modes || {}
      const txsWithModes = mappedTxs.map(tx =>
        txModes[tx.id] !== undefined ? { ...tx, mode: txModes[tx.id] } : tx
      )

      setTransactions(txsWithModes)
      setAccounts({ ...investmentAccounts, bank_accounts: mappedBankAccts })
      setLmSyncedAt(new Date())
    } catch (err) {
      setLmError(err.message)
    } finally {
      setLmSyncing(false)
    }
  }, [])

  // Re-sync when LM key is added/changed in settings
  const triggerLmSync = useCallback(async () => {
    if (!settings?.lunchmoney_key) return
    const investAccounts = accounts ? { ...accounts, bank_accounts: [] } : DEFAULT_ACCOUNTS
    await syncFromLunchMoney(settings.lunchmoney_key, investAccounts)
  }, [settings?.lunchmoney_key, accounts])

  const refreshRate = useCallback(async () => {
    setRateLoading(true)
    clearRateCache()
    try { setUsdCadRate(await getUsdCadRate()) } catch {}
    setRateLoading(false)
  }, [])

  const saveProfile = useCallback(async (data) => {
    if (!session?.user) return 'Not signed in'
    const { error } = await supabase.from('profiles').upsert(
      { user_id: session.user.id, ...data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    if (!error) setProfile(prev => ({ ...prev, ...data }))
    return error?.message || null
  }, [session])

  const saveAccounts = useCallback(async (data) => {
    if (!session?.user) return 'Not signed in'
    const { error } = await supabase.from('accounts').upsert(
      { user_id: session.user.id, data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    if (!error) setAccounts(data)
    return error?.message || null
  }, [session])

  const saveSettings = useCallback(async (data) => {
    if (!session?.user) return 'Not signed in'
    const { error } = await supabase.from('settings').upsert(
      { user_id: session.user.id, ...data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    if (!error) setSettings(prev => ({ ...prev, ...data }))
    return error?.message || null
  }, [session])

  // Manual transaction management (only used when LunchMoney is NOT active)
  const addTransactions = useCallback(async (newTxs) => {
    if (!session?.user) return { error: 'Not signed in' }
    const rows = newTxs.map(t => ({ ...t, user_id: session.user.id }))
    const { data, error } = await supabase.from('transactions').insert(rows).select()
    if (!error && data) {
      setTransactions(prev => [...data, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)))
    }
    return { error: error?.message || null, count: data?.length || 0 }
  }, [session])

  const updateTransaction = useCallback(async (id, updates) => {
    if (!session?.user) return
    // For LunchMoney transactions, persist mode overrides in accounts.tx_modes
    if (updates.mode !== undefined) {
      setAccounts(prev => {
        if (!prev) return prev
        const txModes = { ...(prev.tx_modes || {}), [id]: updates.mode }
        const next = { ...prev, tx_modes: txModes }
        // Fire-and-forget save to Supabase
        supabase.from('accounts').upsert(
          { user_id: session.user.id, data: next, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        return next
      })
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
      return null
    }
    const { error } = await supabase.from('transactions').update(updates)
      .eq('id', id).eq('user_id', session.user.id)
    if (!error) setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    return error?.message || null
  }, [session])

  const clearTransactions = useCallback(async () => {
    if (!session?.user) return
    const { error } = await supabase.from('transactions').delete().eq('user_id', session.user.id)
    if (!error) setTransactions([])
    return error?.message || null
  }, [session])

  const saveChatHistory = useCallback(async (messages) => {
    if (!session?.user) return
    setChatHistory(messages)
    await supabase.from('chat_history').upsert(
      { user_id: session.user.id, messages, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }, [session])

  const clearAllData = useCallback(async () => {
    if (!session?.user) return
    const uid = session.user.id
    await Promise.all([
      supabase.from('transactions').delete().eq('user_id', uid),
      supabase.from('chat_history').upsert({ user_id: uid, messages: [], updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
      supabase.from('accounts').upsert({ user_id: uid, data: DEFAULT_ACCOUNTS, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
    ])
    setTransactions([])
    setChatHistory([])
    setAccounts(DEFAULT_ACCOUNTS)
  }, [session])

  const value = {
    session, loading,
    profile, accounts, transactions, settings, chatHistory,
    usdCadRate, rateLoading,
    lmActive, lmSyncing, lmSyncedAt, lmError,
    activeTab, setActiveTab,
    refreshRate,
    saveProfile, saveAccounts, saveSettings,
    addTransactions, updateTransaction, clearTransactions,
    saveChatHistory, clearAllData,
    triggerLmSync,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
