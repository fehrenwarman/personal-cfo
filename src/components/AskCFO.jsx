import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { callClaude, buildFinancialContext } from '../lib/claude'
import { Send, Trash2 } from 'lucide-react'

const QUICK_PROMPTS = [
  'Should I convert my USD to CAD now or wait?',
  'Am I on track for retirement?',
  'How much should I put in TFSA vs RRSP this year?',
  'What are my biggest spending leaks?',
  "How much should I save for my kids' university?",
  'Is my business deduction strategy optimal?',
]

const CFO_TONE = `You are a personal CFO assistant for a Canadian. Your tone is warm but direct. Lead with the big picture and strategic view first. Use specific numbers from the user's data when relevant. Avoid bullet points unless listing 4 or more distinct items. Never use em dashes. Be concise and actionable.`

export default function AskCFO() {
  const { profile, accounts, transactions, settings, chatHistory, saveChatHistory, usdCadRate } = useApp()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, loading])

  const context = buildFinancialContext({ profile, accounts, transactions, usdCadRate })
  const systemPrompt = `${CFO_TONE}\n\n${context}`

  async function send(message) {
    if (!message.trim()) return
    if (!settings?.api_key) {
      setError('Add your Anthropic API key in Settings to use Ask CFO.')
      return
    }

    const userMsg = { role: 'user', content: message.trim() }
    const updatedHistory = [...chatHistory, userMsg]
    saveChatHistory(updatedHistory)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const reply = await callClaude({
        apiKey: settings.api_key,
        system: systemPrompt,
        messages: updatedHistory,
        maxTokens: 1024,
      })

      const assistantMsg = { role: 'assistant', content: reply }
      saveChatHistory([...updatedHistory, assistantMsg])
    } catch (err) {
      setError(err.message)
      saveChatHistory(chatHistory) // revert
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function clearChat() {
    saveChatHistory([])
    setError(null)
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Ask CFO</h2>
        {chatHistory.length > 0 && (
          <button onClick={clearChat} style={styles.clearBtn}>
            <Trash2 size={13} />
            Clear Chat
          </button>
        )}
      </div>

      <div style={styles.chatWrap}>
        <div style={styles.messages}>
          {chatHistory.length === 0 && !loading && (
            <div style={styles.emptyState}>
              <h3 style={styles.emptyTitle}>Your Personal CFO is ready</h3>
              <p style={styles.emptySub}>Ask anything about your finances. Try one of these to start:</p>
              <div style={styles.quickGrid}>
                {QUICK_PROMPTS.map(q => (
                  <button key={q} onClick={() => send(q)} style={styles.quickBtn}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.message,
                ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
              }}
            >
              <div style={{ ...styles.msgLabel, color: msg.role === 'user' ? '#555' : '#c8f264' }}>
                {msg.role === 'user' ? 'You' : 'CFO'}
              </div>
              <div style={styles.msgContent}>{msg.content}</div>
            </div>
          ))}

          {loading && (
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={{ ...styles.msgLabel, color: '#c8f264' }}>CFO</div>
              <div style={styles.thinking}>
                <span style={styles.dot} />
                <span style={styles.dot} />
                <span style={styles.dot} />
              </div>
            </div>
          )}

          {error && (
            <div style={styles.errorMsg}>{error}</div>
          )}

          <div ref={bottomRef} />
        </div>

        <div style={styles.inputRow}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your CFO anything..."
            rows={2}
            style={styles.textarea}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{
              ...styles.sendBtn,
              opacity: loading || !input.trim() ? 0.4 : 1,
            }}
          >
            <Send size={16} />
          </button>
        </div>
        <div style={styles.hint}>Enter to send, Shift+Enter for new line</div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', color: '#e8e8e8' },
  clearBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '7px 14px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '8px',
    color: '#555', fontSize: '13px', cursor: 'pointer',
  },
  chatWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px',
    overflow: 'hidden',
  },
  messages: {
    flex: 1, overflowY: 'auto', padding: '24px',
    display: 'flex', flexDirection: 'column', gap: '20px',
    minHeight: '400px', maxHeight: 'calc(100vh - 280px)',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '16px', padding: '32px 0',
  },
  emptyTitle: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '22px', color: '#e8e8e8', textAlign: 'center', fontWeight: 400,
  },
  emptySub: { fontSize: '13px', color: '#555', textAlign: 'center' },
  quickGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%', maxWidth: '600px',
  },
  quickBtn: {
    padding: '12px 16px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '10px',
    color: '#888', fontSize: '13px', cursor: 'pointer',
    textAlign: 'left', lineHeight: '1.4',
    transition: 'all 0.15s',
  },
  message: { display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '80%' },
  userMessage: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  assistantMessage: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  msgLabel: { fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' },
  msgContent: {
    padding: '14px 16px', borderRadius: '12px',
    fontSize: '14px', lineHeight: '1.65', color: '#e8e8e8',
    background: '#1e1e1e', border: '1px solid #2a2a2a',
    whiteSpace: 'pre-wrap',
  },
  thinking: { display: 'flex', gap: '6px', padding: '14px 16px' },
  dot: {
    width: '6px', height: '6px', borderRadius: '50%',
    background: '#555', animation: 'pulse 1.4s ease-in-out infinite',
  },
  errorMsg: {
    padding: '12px 16px', background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)', borderRadius: '10px',
    color: '#ff6b6b', fontSize: '13px',
  },
  inputRow: {
    display: 'flex', gap: '12px', padding: '16px',
    borderTop: '1px solid #2a2a2a', alignItems: 'flex-end',
  },
  textarea: {
    flex: 1, padding: '10px 14px', background: '#1e1e1e',
    border: '1px solid #2a2a2a', borderRadius: '10px',
    color: '#e8e8e8', fontSize: '14px', outline: 'none',
    resize: 'none', lineHeight: '1.5',
  },
  sendBtn: {
    padding: '10px 14px', background: '#c8f264',
    border: 'none', borderRadius: '10px',
    color: '#0f0f0f', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  hint: { fontSize: '11px', color: '#333', textAlign: 'center', paddingBottom: '8px' },
}
