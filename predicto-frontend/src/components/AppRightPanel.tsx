import { X, Send, Loader2, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface AppRightPanelProps {
  open: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AppRightPanel({ open, onClose }: AppRightPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Hello! I'm your AI Analyst. I can help you analyze revenue trends, identify growth opportunities, and answer questions about your data.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          "I'm analyzing your request. In a real implementation, this would connect to your AI backend to provide insights.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Right Panel — fixed, z-40 */}
      <aside
        className={`fixed right-0 top-0 bottom-0 w-96 glass-heavy flex flex-col
                    transition-transform duration-300 ease-in-out z-40
                    border-l border-white/[0.06] shadow-glass-card
                    ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* ── Header ── */}
        <div className="h-16 border-b border-white/[0.06] flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Gradient icon */}
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-neon-indigo">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <h2 className="text-sm font-semibold text-slate-100">AI Analyst</h2>
              <span className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">
                Powered by Predicto
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            id="right-panel-close"
            className="p-1.5 glass-light rounded-lg hover:border-white/10 border border-transparent transition-all duration-200 lg:hidden"
            aria-label="Close panel"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2.5 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-fade-in`}
            >
              {message.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex-shrink-0 flex items-center justify-center shadow-neon-indigo mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-sm shadow-neon-indigo'
                    : 'glass text-slate-100 rounded-tl-sm'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2.5 justify-start animate-fade-in">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex-shrink-0 flex items-center justify-center shadow-neon-indigo">
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              </div>
              <div className="glass px-4 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input ── */}
        <div className="border-t border-white/[0.06] p-4 flex-shrink-0">
          <div className="flex gap-2 glass rounded-xl p-1 pr-1">
            <input
              id="ai-analyst-input"
              type="text"
              placeholder="Ask anything about your data…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isLoading}
              className="flex-1 px-3 py-2.5 bg-transparent text-sm text-slate-100 placeholder-slate-500
                         focus:outline-none disabled:opacity-50"
            />
            <button
              id="ai-analyst-send"
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="p-2.5 bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600
                         disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed
                         text-white rounded-lg transition-all duration-200 flex-shrink-0
                         shadow-neon-indigo disabled:shadow-none active:scale-95"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-600 mt-2">
            AI can make mistakes. Verify important decisions.
          </p>
        </div>
      </aside>
    </>
  );
}
