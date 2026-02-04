import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

/** --- CONSTANTS & CONFIG --- */
const API_BASE = '/api';

const INITIAL_STATE = {
  models: [], chats: [], currentChatId: null, messages: [], 
  isLoading: false, streamingContent: '', error: null, sidebarOpen: true
};

/** --- CUSTOM ICONS (SVG System) --- */
const Icons = {
  Menu: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Upload: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>,
  Send: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>,
  Stop: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>,
  Bot: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M4 11v2a6 6 0 0 0 6 6l1 2h2l1-2a6 6 0 0 0 6-6v-2"></path></svg>,
  User: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  PDF: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Shield: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
  Alert: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  File: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>,
  Edit: () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
  </svg>
),
ChevronDown: () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
),
ChevronRight: () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
)
};

/** --- APP COMPONENT --- */
function App() {
  const [models, setModels] = useState([]);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [modelA, setModelA] = useState('gpt-4.1');
  const [modelB, setModelB] = useState('gemini-2.5-flash');
  const [maxRounds, setMaxRounds] = useState(5);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [collapsedByChat, setCollapsedByChat] = useState({}); // { [chatId]: boolean }

  const messagesEndRef = useRef(null);
  const abortCtrl = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/models`).then(r => r.json()).then(data => setModels(data.models || []));
    loadChatList();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);

  const loadChatList = async () => { try { const data = await (await fetch(`${API_BASE}/chats`)).json(); setChats(data.chats || []); } catch (e) {} };
  
  const loadChat = async (chatId) => {
    try {
      const data = await (await fetch(`${API_BASE}/chats/${chatId}`)).json();
      setCurrentChatId(data.id);
      setMessages((data.messages || []).map(msg => ({ 
        ...msg, 
        full_json: msg.full_json || (msg.metadata ? msg.metadata.full_json : null),
        exchange: msg.exchange !== undefined ? msg.exchange : msg.round 
      })));
      setSystemPrompt(data.system_prompt || '');
    } catch (e) {}
  };

  const chatKey = currentChatId || '__new__';
const isCollapsed = !!collapsedByChat[chatKey];

const toggleCollapsed = () => {
  setCollapsedByChat(prev => ({ ...prev, [chatKey]: !prev[chatKey] }));
};

/**
 * Collapses debate rounds per user prompt.
 * Keeps:
 *  - each user message
 *  - the final assistant message for that segment, preferring:
 *      System Consensus (type: final) OR System Judge (type: synthesis)
 *    else fallback to last assistant message in the segment.
 */
const collapseDebateMessages = (all) => {
  const out = [];
  let i = 0;

  const isUser = (m) => m?.role === 'user';

  const isFinalMsg = (m) =>
    m?.type === 'final' ||
    m?.type === 'synthesis' ||
    m?.modelName === 'System Consensus' ||
    m?.modelName === 'System Judge';

  while (i < all.length) {
    const m = all[i];

    if (!isUser(m)) {
      // If chat starts with assistant (shouldn't normally), keep it as-is
      out.push(m);
      i += 1;
      continue;
    }

    // Start segment at user message
    out.push(m);
    i += 1;

    // Collect assistant messages until next user or end
    const segment = [];
    while (i < all.length && !isUser(all[i])) {
      segment.push(all[i]);
      i += 1;
    }

    if (segment.length === 0) continue;

    const finalCandidate = [...segment].reverse().find(isFinalMsg);
    out.push(finalCandidate || segment[segment.length - 1]);
  }

  return out;
};

const displayedMessages = useMemo(() => {
  return isCollapsed ? collapseDebateMessages(messages) : messages;
}, [messages, isCollapsed]);

  const createNewChat = () => { setCurrentChatId(null); setMessages([]); setSystemPrompt(''); };
  const deleteChat = async (chatId, e) => { e.stopPropagation(); await fetch(`${API_BASE}/chats/${chatId}`, { method: 'DELETE' }); loadChatList(); if (currentChatId === chatId) createNewChat(); };

  const saveChatToDB = async (history) => {
    const title = !currentChatId ? (history[0]?.content?.slice(0, 30) || "Research Session") : undefined;
    try {
      await fetch(`${API_BASE}/chats/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: currentChatId, title, mode: 'deep', system_prompt: systemPrompt,
          messages: history.map(m => ({
            role: m.role, content: m.content || '', model: m.model, round: m.exchange,
            metadata: { modelName: m.modelName, exchange: m.exchange, full_json: m.full_json, type: m.type }
          }))
        })
      }).then(r => r.json()).then(d => { if (!currentChatId) { setCurrentChatId(d.chat_id); loadChatList(); } });
    } catch (e) {}
  };

  const renameChat = async (chatId, e) => {
  e?.stopPropagation?.();
  const newTitle = window.prompt("Rename chat:", chats.find(c => c.id === chatId)?.title || "");
  if (!newTitle || !newTitle.trim()) return;

  try {
    // If it's the currently open chat, reuse in-memory messages to avoid extra fetch.
    if (chatId === currentChatId) {
      await fetch(`${API_BASE}/chats/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          title: newTitle.trim(),
          mode: 'deep',
          system_prompt: systemPrompt,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content || '',
            model: m.model,
            round: m.exchange,
            metadata: {
              modelName: m.modelName,
              exchange: m.exchange,
              full_json: m.full_json,
              type: m.type
            }
          }))
        })
      });
      await loadChatList();
      return;
    }

    // Otherwise, fetch chat from backend, then resave with new title.
    const data = await (await fetch(`${API_BASE}/chats/${chatId}`)).json();
    const savedMsgs = (data.messages || []).map(m => ({
      role: m.role,
      content: m.content || '',
      model: m.model,
      round: m.round,
      metadata: {
        modelName: m.modelName,
        exchange: m.exchange ?? m.round,
        full_json: m.full_json ?? (m.metadata ? m.metadata.full_json : null),
        type: m.type
      }
    }));

    await fetch(`${API_BASE}/chats/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        title: newTitle.trim(),
        mode: data.mode || 'deep',
        system_prompt: data.system_prompt || '',
        messages: savedMsgs
      })
    });

    await loadChatList();
  } catch (err) {
    console.error("Rename failed:", err);
  }
};

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = { role: 'user', content: input };
    const currentHistory = [...messages, userMsg];
    setMessages(currentHistory); setInput(''); setIsLoading(true); setStreamingContent('');
    
    abortCtrl.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/chat/deep-discuss`, { 
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ prompt: userMsg.content, model_a: modelA, model_b: modelB, max_rounds: maxRounds, system_prompt: systemPrompt }), 
        signal: abortCtrl.current.signal 
      });
      
      const reader = res.body.getReader(); 
      const decoder = new TextDecoder();
      let buffer = ""; 
      let collectedMessages = [];
      setStreamingContent("Initializing Research Protocol...");

      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'status') setStreamingContent(event.msg);
            else if (event.type === 'exchange') {
               collectedMessages.push({
                 role: 'assistant', model: event.data.model, modelName: event.data.model_name,
                 content: event.data.content, full_json: event.data.full_json, exchange: event.data.exchange, type: event.data.type
               });
               setMessages([...currentHistory, ...collectedMessages]);
            }
          } catch (e) {}
        }
      }
      saveChatToDB([...currentHistory, ...collectedMessages]);
    } catch (e) { 
      if (e.name !== 'AbortError') setMessages([...currentHistory, { role: 'error', content: e.message }]); 
    } finally { setIsLoading(false); setStreamingContent(''); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    if (file.name.endsWith('.pdf')) fetch(`${API_BASE}/upload/pdf`, { method: 'POST', body: formData }).then(r=>r.json()).then(d=>setInput(p=>p+`\n[PDF Context: ${file.name}]`));
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans selection:bg-indigo-500/30">
      {/* SIDEBAR */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-0'} bg-gray-950 border-r border-gray-800 flex flex-col transition-all overflow-hidden`}>
        <div className="p-5 border-b border-gray-800">
          <button onClick={createNewChat} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-sm shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all">
            <Icons.Plus /> New Research
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="text-[10px] font-bold text-gray-500 px-3 mb-3 uppercase tracking-widest">History</div>
          {chats.map(chat => (
            <div key={chat.id} onClick={() => loadChat(chat.id)} className={`group relative p-3 rounded-lg cursor-pointer transition-all ${currentChatId === chat.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
              <div className="font-medium text-sm truncate pr-6">{chat.title}</div>
              <div className="text-[10px] text-gray-600 mt-1 font-mono">{new Date(chat.updated_at).toLocaleDateString()}</div>
              <div className="absolute right-2 top-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => renameChat(chat.id, e)}
                className="text-gray-500 hover:text-indigo-300"
                title="Rename"
              >
                <Icons.Edit />
              </button>
              <button
                onClick={(e) => deleteChat(chat.id, e)}
                className="text-gray-500 hover:text-red-400"
                title="Delete"
              >
                <Icons.Trash />
              </button>
            </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-black/40">
        {/* HEADER */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-gray-800/50 bg-gray-950/50 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white transition-colors"><Icons.Menu /></button>
            <div className="flex items-center gap-3 bg-gray-900/50 p-1.5 rounded-xl border border-gray-800">
              <div className="flex items-center gap-2 px-2">
                <span className="text-xs font-bold text-indigo-400 uppercase">Model A</span>
                <select value={modelA} onChange={e=>setModelA(e.target.value)} className="bg-transparent text-sm font-medium text-gray-200 focus:outline-none cursor-pointer">{models.map(m=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select>
              </div>
              <span className="text-gray-600 text-xs font-bold">VS</span>
              <div className="flex items-center gap-2 px-2">
                <span className="text-xs font-bold text-rose-400 uppercase">Model B</span>
                <select value={modelB} onChange={e=>setModelB(e.target.value)} className="bg-transparent text-sm font-medium text-gray-200 focus:outline-none cursor-pointer">{models.map(m=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800">
              <span className="text-xs text-gray-500 font-bold uppercase">Rounds</span>
              <input type="number" min="1" max="10" value={maxRounds} onChange={e=>setMaxRounds(parseInt(e.target.value))} className="bg-transparent text-sm text-center w-8 text-white focus:outline-none" />
            </div>
            <button
              onClick={toggleCollapsed}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition-colors"
              title={isCollapsed ? "Expand debate rounds" : "Collapse to final only"}
            >
              {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
              {isCollapsed ? "Show Debate" : "Final Only"}
            </button>
            {currentChatId && <button onClick={() => window.open(`${API_BASE}/chats/${currentChatId}/export/pdf`)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition-colors"><Icons.PDF /> Export</button>}
          </div>
        </header>

        {/* CHAT AREA */}
        <div className="flex-1 overflow-y-auto px-4 md:px-32 py-8 scroll-smooth scrollbar-thin">
          {messages.length === 0 && !streamingContent && (
             <div className="h-full flex flex-col items-center justify-center text-gray-700 select-none animate-fade-in">
               <div className="w-24 h-24 bg-gray-900 rounded-3xl flex items-center justify-center mb-6 border border-gray-800 shadow-2xl"><span className="text-5xl opacity-50">🧬</span></div>
               <h2 className="text-2xl font-semibold text-gray-300 mb-2">Research Hub</h2>
               <p className="text-sm text-gray-500">Configure models and start an adversarial debate</p>
             </div>
          )}
          {displayedMessages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          {streamingContent && (
            <div className="flex justify-start mb-8 animate-fade-in w-full max-w-4xl">
              <div className="bg-gray-900/50 border border-indigo-500/30 rounded-2xl px-6 py-4 flex items-center gap-3 shadow-lg shadow-indigo-900/10">
                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-indigo-300 tracking-wide">{streamingContent}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-8" />
        </div>

        {/* INPUT AREA */}
        <div className="p-6 relative z-30">
          <div className="max-w-4xl mx-auto relative bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-gray-800 shadow-2xl shadow-black/50 ring-1 ring-white/5 focus-within:ring-indigo-500/50 transition-all">
             <div className="flex items-end gap-3 p-3">
                <button onClick={() => document.querySelector('input[type="file"]').click()} className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"><Icons.Upload /><input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf" /></button>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="Describe the problem to solve..." className="flex-1 bg-transparent border-none text-gray-200 placeholder-gray-600 focus:ring-0 resize-none py-3 max-h-48 min-h-[56px] text-base" rows={1} />
                {isLoading ? (
                  <button onClick={() => abortCtrl.current?.abort()} className="p-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-all"><Icons.Stop /></button>
                ) : (
                  <button onClick={handleSend} disabled={!input.trim()} className="p-3 bg-white text-black hover:bg-gray-200 disabled:opacity-30 disabled:bg-gray-800 disabled:text-gray-500 rounded-xl transition-all"><Icons.Send /></button>
                )}
             </div>
             <div className="px-4 pb-2 border-t border-white/5 pt-2">
                <input type="text" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="System Instruction (Optional Persona)..." className="w-full bg-transparent text-xs text-gray-400 placeholder-gray-700 focus:outline-none" />
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** --- MESSAGE BUBBLE COMPONENT --- */
const MessageBubble = ({ msg }) => {
  const { role, content, full_json, exchange, modelName } = msg;
  const isUser = role === 'user';
  const isFinal = modelName === 'System Consensus';
  const hasCritiqueShape =
  full_json &&
  (full_json.critique ||
    full_json.better_solution ||
    (Array.isArray(full_json.positive_points) && full_json.positive_points.length) ||
    (Array.isArray(full_json.negative_points) && full_json.negative_points.length));

  if (isUser) return (
    <div className="flex justify-end mb-10 animate-fade-in">
      <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-6 py-4 max-w-3xl shadow-xl shadow-indigo-900/20">
        <div className="flex items-center gap-2 mb-2 opacity-70 text-xs font-bold uppercase tracking-wider"><Icons.User /> You</div>
        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
      </div>
    </div>
  );

  return (
    <div className="flex justify-start mb-12 w-full animate-fade-in group">
      <div className={`w-full max-w-4xl border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm transition-all ${isFinal ? 'bg-emerald-950/10 border-emerald-500/30 shadow-emerald-900/10' : 'bg-gray-900/40 border-gray-800'}`}>
        {/* Header */}
        <div className={`px-5 py-3 flex items-center justify-between border-b ${isFinal ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/5'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${isFinal ? 'bg-emerald-500 text-black' : msg.role === 'critic' ? 'bg-rose-500 text-white' : 'bg-indigo-500 text-white'}`}><Icons.Bot /></div>
            <div>
              <div className={`text-sm font-bold ${isFinal ? 'text-emerald-400' : 'text-gray-200'}`}>{modelName || 'Assistant'}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono leading-none mt-0.5">{exchange === 0 ? "Initial Draft" : isFinal ? "Consensus Reached" : `Round ${exchange} • Critique`}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {hasCritiqueShape ? (
            <div className="space-y-8">
               {/* Critique */}
               {full_json.critique && (
                 <div className="pl-4 border-l-2 border-amber-500/50">
                   <div className="text-[10px] font-bold text-amber-500 uppercase mb-1 tracking-widest">Analysis</div>
                   <p className="text-amber-100/80 text-sm leading-relaxed italic">"{full_json.critique}"</p>
                 </div>
               )}
               
               {/* Points */}
               {(full_json.positive_points?.length > 0 || full_json.negative_points?.length > 0) && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {full_json.positive_points?.length > 0 && (
                     <div className="space-y-2">
                       <h5 className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-widest"><Icons.Shield /> Strengths</h5>
                       <ul className="space-y-1.5">{full_json.positive_points.map((p,i)=><li key={i} className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed"><span className="w-1 h-1 rounded-full bg-emerald-500/50 mt-1.5 shrink-0"></span>{p}</li>)}</ul>
                     </div>
                   )}
                   {full_json.negative_points?.length > 0 && (
                     <div className="space-y-2">
                       <h5 className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-widest"><Icons.Alert /> Issues Detected</h5>
                       <ul className="space-y-1.5">{full_json.negative_points.map((p,i)=><li key={i} className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed"><span className="w-1 h-1 rounded-full bg-rose-500/50 mt-1.5 shrink-0"></span>{p}</li>)}</ul>
                     </div>
                   )}
                 </div>
               )}

               {/* Solution */}
               {full_json.better_solution && !full_json.better_solution.includes("CONVERGED") && full_json.better_solution.length > 20 && (
                 <div className={`mt-4 pt-6 border-t ${isFinal ? 'border-emerald-500/20' : 'border-gray-800'}`}>
                   <div className={`text-xs font-bold mb-4 uppercase tracking-widest flex items-center gap-2 ${isFinal ? 'text-emerald-400' : 'text-indigo-400'}`}>
                     {isFinal ? <><Icons.Check /> Final Consensus Solution</> : <><Icons.File /> Improved Implementation</>}
                   </div>
                   <div className="prose prose-invert prose-sm max-w-none text-gray-300"><MarkdownContent content={full_json.better_solution} /></div>
                 </div>
               )}
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none text-gray-300"><MarkdownContent content={content} /></div>
          )}
        </div>
      </div>
    </div>
  );
};

/** --- UTILS --- */
const CodeBlock = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  if (!children || !children.trim()) return null;
  return (
    <div className="relative group my-5 rounded-lg overflow-hidden border border-white/10 bg-black/50">
      <div className="flex justify-between items-center px-3 py-1.5 bg-white/5 border-b border-white/5">
         <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{language || 'CODE'}</span>
         <button onClick={()=>{navigator.clipboard.writeText(children);setCopied(true);setTimeout(()=>setCopied(false),2000)}} className="text-[10px] font-medium text-gray-400 hover:text-white flex items-center gap-1 transition-colors">{copied ? <span className="text-emerald-400">Copied</span> : <><Icons.Copy /> Copy</>}</button>
      </div>
      <SyntaxHighlighter style={vscDarkPlus} language={language || 'text'} PreTag="div" customStyle={{ margin: 0, padding: '1.25rem', background: 'transparent', fontSize: '0.8rem', lineHeight: '1.6' }}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
    </div>
  );
};

const MarkdownContent = ({ content }) => <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    code({ inline, className, children }) {
      const match = /language-(\w+)/.exec(className || '');
      const txt = String(children || '').replace(/\n$/, '');
      if (!inline && txt.trim()) return <CodeBlock language={match?.[1]}>{txt}</CodeBlock>;
      return <code className="bg-white/10 px-1.5 py-0.5 rounded text-[0.75em] font-mono text-indigo-200 border border-white/5">{children}</code>;
    },
    p: ({ children }) => <p className="mb-4 leading-7 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1 marker:text-gray-600">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1 marker:text-gray-600">{children}</ol>,
    h1: ({ children }) => <h1 className="text-xl font-bold text-white mt-8 mb-4">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-6 mb-3">{children}</h2>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">{children}</a>,
}}>{content}</ReactMarkdown>;

export default App;