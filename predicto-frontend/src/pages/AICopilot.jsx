import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Lightbulb } from 'lucide-react';
import { mockAIResponses } from '../data/mockAIResponses';

const ChatMessage = ({ message, isUser, isTyping }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 w-full`}
    >
      <div
        className={`max-w-2xl px-6 py-4 rounded-lg ${
          isUser
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-none'
            : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none'
        }`}
      >
        {isTyping ? (
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-75">Thinking</span>
            <motion.div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  className="w-2 h-2 bg-current rounded-full"
                />
              ))}
            </motion.div>
          </div>
        ) : (
          <p className="text-base leading-relaxed whitespace-pre-wrap">{message}</p>
        )}
      </div>
    </motion.div>
  );
};

const SuggestionCard = ({ text, icon: Icon, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.02, translateY: -2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="flex-1 p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-indigo-500/50 transition-all text-left min-h-24 flex flex-col justify-between"
  >
    <Icon size={20} className="text-indigo-400 mb-2" />
    <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
  </motion.button>
);

export default function AICopilot() {
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [chatHistory]);

  // Auto-expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [currentInput]);

  const handleSendMessage = async () => {
    if (!currentInput.trim()) return;

    const userMessage = currentInput.trim();
    setCurrentInput('');
    setIsLoading(true);

    // Add user message to history
    setChatHistory((prev) => [...prev, { role: 'user', content: userMessage }]);

    // Simulate API call delay
    setTimeout(() => {
      // Find a mock response (in production, this would be from Groq API)
      const mockResponse =
        mockAIResponses.find((r) => r.query.toLowerCase().includes(userMessage.toLowerCase()?.split(' ')[0])) ||
        mockAIResponses[Math.floor(Math.random() * mockAIResponses.length)];

      setIsLoading(false);
      setIsStreaming(true);

      // Simulate streaming response with typing effect
      let currentText = '';
      const chars = mockResponse.response.split('');

      const streamChar = (index) => {
        if (index < chars.length) {
          currentText += chars[index];
          setChatHistory((prev) => {
            const updated = [...prev];
            if (updated[updated.length - 1]?.role === 'assistant') {
              updated[updated.length - 1].content = currentText;
            } else {
              updated.push({ role: 'assistant', content: currentText });
            }
            return updated;
          });

          setTimeout(() => streamChar(index + 1), 15);
        } else {
          setIsStreaming(false);
        }
      };

      streamChar(0);
    }, 800);
  };

  const handleSuggestion = (suggestion) => {
    setCurrentInput(suggestion);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-b from-slate-950 to-slate-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <h1 className="text-2xl font-bold text-white">Revenue Intelligence Assistant</h1>
        <p className="text-sm text-slate-400 mt-2">Ask about forecasts, growth opportunities, and business insights</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8">
        {chatHistory.length === 0 && !isLoading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6">
              <Lightbulb size={32} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">What would you like to know?</h2>
            <p className="text-slate-400 text-center mb-12 max-w-xl">
              Ask about revenue forecasts, segment health, persona insights, and strategic opportunities.
            </p>

            {/* Suggestion Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <SuggestionCard
                icon={Lightbulb}
                text="Which segment is at the highest margin risk this quarter?"
                onClick={() => handleSuggestion('Which segment is at the highest margin risk this quarter?')}
              />
              <SuggestionCard
                icon={Lightbulb}
                text="What's driving the 52% growth in the Unicorn CFO persona?"
                onClick={() => handleSuggestion("What's driving the 52% growth in the Unicorn CFO persona?")}
              />
              <SuggestionCard
                icon={Lightbulb}
                text="Analyze the forecast accuracy by segment for next quarter."
                onClick={() => handleSuggestion('Analyze the forecast accuracy by segment for next quarter.')}
              />
              <SuggestionCard
                icon={Lightbulb}
                text="What's our revenue growth trajectory for the next 6 months?"
                onClick={() => handleSuggestion("What's our revenue growth trajectory for the next 6 months?")}
              />
            </div>
          </motion.div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <AnimatePresence mode="wait">
              {chatHistory.map((msg, idx) => (
                <ChatMessage
                  key={idx}
                  message={msg.content}
                  isUser={msg.role === 'user'}
                  isTyping={false}
                />
              ))}
            </AnimatePresence>

            {isStreaming && (
              <ChatMessage message="" isUser={false} isTyping={true} />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-6 py-6 border-t border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-4 items-end">
            <textarea
              ref={textareaRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about revenue, forecasts, growth opportunities..."
              disabled={isLoading || isStreaming}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none max-h-32 disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSendMessage}
              disabled={!currentInput.trim() || isLoading || isStreaming}
              className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </motion.button>
          </div>
          <p className="text-xs text-slate-500 mt-3">Press Cmd+Enter (Mac) or Ctrl+Enter (Windows) to send</p>
        </div>
      </div>
    </div>
  );
}
