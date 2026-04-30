import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getUsdCadRate, clearRateCache } from '../lib/exchangeRate'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  // Data
  const [profile, setProfile] = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [settings, setSettings] = useState(null)
  const [chatHistory, setChatHistory] = useState([])

  // Exchange rate
  const [usdCadRate, setUsdCadRate] = useState(1.38)
  const [rateLoading, setRateLoading] = useState(false)

  // UI
  const [activeTab, setActiveTab] = useState('overview')

  // Auth listener
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

  // Load exchange rate on mount
  useEffect(() => {
    setRateLoading(true)
    getUsdCadRate()
      .then(rate => setUsdCadRate(rate))
      .catch(() => {}) // keep default
      .finally(() => setRateLoading(false))
  }, [])

  // Load user data when session changes
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
    const [profileRes, accountsRes, txRes, settingsRes, chatRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('accounts').select('*').eq('user_id', userId).single(),
      supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('settings').select('*').eq('user_id', userId).single(),
      supabase.from('chat_history').select('*').eq('user_id', userId).single(),
    ])

    if (profileRes.data) setProfile(profileRes.data)
    if (accountsRes.data) setAccounts(accountsRes.data.data || {})
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
    if (!session?.user) return
    const { error } = await supabase.from('profiles').upsert({
      user_id: session.user.id,
      ...data,
      updated_at: new Date().toISOString(),
    })
    if (!error) setProfile(prev => ({ ...prev, ...data }))
    return error
  }, [session])

  const saveAccounts = useCallback(async (data) => {
    if (!session?.user) return
    const { error } = await supabase.from('accounts').upsert({
      user_id: session.user.id,
      data,
      updated_at: new Date().toISOString(),
    })
    if (!error) setAccounts(data)
    return error
  }, [session])

  const saveSettings = useCallback(async (data) => {
    if (!session?.user) return
    const { error } = await supabase.from('settings').upsert({
      user_id: session.user.id,
      ...data,
      updated_at: new Date().toISOString(),
    })
    if (!error) setSettings(prev => ({ ...prev, ...data }))
    return error
  }, [session])

  const addTransactions = useCallback(async (newTxs) => {
    if (!session?.user) return
    const rows = newTxs.map(t => ({ ...t, user_id: session.user.id }))
    const { data, error } = await supabase.from('transactions').insert(rows).select()
    if (!error && data) {
      setTransactions(prev => [...data, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)))
    }
    return error
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
    return error
  }, [session])

  const clearTransactions = useCallback(async () => {
    if (!session?.user) return
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', session.user.id)
    if (!error) setTransactions([])
    return error
  }, [session])

  const saveChatHistory = useCallback(async (messages) => {
    if (!session?.user) return
    setChatHistory(messages)
    await supabase.from('chat_history').upsert({
      user_id: session.user.id,
      messages,
      updated_at: new Date().toISOString(),
    })
  }, [session])

  const clearAllData = useCallback(async () => {
    if (!session?.user) return
    const uid = session.user.id
    await Promise.all([
      supabase.from('transactions').delete().eq('user_id', uid),
      supabase.from('chat_history').upsert({ user_id: uid, messages: [], updated_at: new Date().toISOString() }),
      supabase.from('accounts').upsert({ user_id: uid, data: {}, updated_at: new Date().toISOString() }),
    ])
    setTransactions([])
    setChatHistory([])
    setAccounts({})
  }, [session])

  const value = {
    session,
    loading,
    profile,
    accounts,
    transactions,
    settings,
    chatHistory,
    usdCadRate,
    rateLoading,
    activeTab,
    setActiveTab,
    refreshRate,
    saveProfile,
    saveAccounts,
    saveSettings,
    addTransactions,
    updateTransaction,
    clearTransactions,
    saveChatHistory,
    clearAllData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
