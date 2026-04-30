import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getUsdCadRate, clearRateCache } from '../lib/exchangeRate'

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
  const { error } = await supabase.from(table).upsert(
    { user_id: userId, ...defaults, updated_at: new Date().toISOString() },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
  if (error) console.warn(`ensureRow ${table}:`, error.message)
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [profile, setProfile] = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [settings, setSettings] = useState(null)
  const [chatHistory, setChatHistory] = useState([])

  const [usdCadRate, setUsdCadRate] = useState(1.38)
  const [rateLoading, setRateLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

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
      .then(rate => setUsdCadRate(rate))
      .catch(() => {})
      .finally(() => setRateLoading(false))
  }, [])

  useEffect(() => {
    if (session?.user) {
      loadAllData(session.user.id)
    } else if (!session) {
      setProfile(null)
      setAccounts(null)
      setTransactions([])
      setSettings(null)
      setChatHistory([])
    }
  }, [session])

  async function loadAllData(userId) {
    // Bootstrap any missing rows for users who signed up before the trigger
    await Promise.all([
      ensureRow('profiles', userId),
      ensureRow('accounts', userId, { data: DEFAULT_ACCOUNTS }),
      ensureRow('settings', userId),
      ensureRow('chat_history', userId, { messages: [] }),
    ])

    const [profileRes, accountsRes, txRes, settingsRes, chatRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('accounts').select('*').eq('user_id', userId).single(),
      supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('settings').select('*').eq('user_id', userId).single(),
      supabase.from('chat_history').select('*').eq('user_id', userId).single(),
    ])

    if (profileRes.data) setProfile(profileRes.data)
    if (accountsRes.data) setAccounts(accountsRes.data.data || DEFAULT_ACCOUNTS)
    if (txRes.data) setTransactions(txRes.data)
    if (settingsRes.data) setSettings(settingsRes.data)
    if (chatRes.data) setChatHistory(chatRes.data.messages || [])
  }

  const refreshRate = useCallback(async () => {
    setRateLoading(true)
    clearRateCache()
    try {
      const rate = await getUsdCadRate()
      setUsdCadRate(rate)
    } catch {}
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
    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', session.user.id)
    if (!error) {
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    }
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
      supabase.from('chat_history').upsert(
        { user_id: uid, messages: [], updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      ),
      supabase.from('accounts').upsert(
        { user_id: uid, data: DEFAULT_ACCOUNTS, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      ),
    ])
    setTransactions([])
    setChatHistory([])
    setAccounts(DEFAULT_ACCOUNTS)
  }, [session])

  const value = {
    session, loading,
    profile, accounts, transactions, settings, chatHistory,
    usdCadRate, rateLoading,
    activeTab, setActiveTab,
    refreshRate,
    saveProfile, saveAccounts, saveSettings,
    addTransactions, updateTransaction, clearTransactions,
    saveChatHistory, clearAllData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
