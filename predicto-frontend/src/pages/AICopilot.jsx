import axios from 'axios';
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
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-8 w-full`}
    >
      <div
        className={`max-w-[75%] px-6 py-4 rounded-2xl shadow-xl ${
          isUser
            ? 'bg-purple-600/80 backdrop-blur-xl text-white rounded-tr-none border border-white/20 self-end'
            : 'bg-white/5 backdrop-blur-md border border-white/10 text-slate-100 rounded-tl-none self-start'
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
    className="flex-1 p-4 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-lg hover:border-indigo-500/50 transition-all text-left min-h-24 flex flex-col justify-between"
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

    try {
      // Connect to real backend - ensuring endpoint matches backend router
      const response = await axios.post('http://localhost:8001/api/v1/ai/analyze', {
        query: userMessage
      });

      // Backend returns { insight: "..." } as per AIAnalyzeResponse schema
      const aiResponse = response.data.insight || "I've analyzed your request but couldn't generate a specific insight at this moment.";

      setIsLoading(false);
      setIsStreaming(true);

      // Simulate streaming response with typing effect for a premium feel
      let currentText = '';
      const chars = aiResponse.split('');

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

          setTimeout(() => streamChar(index + 1), 5); // Faster typing
        } else {
          setIsStreaming(false);
        }
      };

      streamChar(0);
    } catch (error) {
      console.error('Chat Error (Real-time Context):', error);
      setIsLoading(false);
      
      const errorMsg = "I'm having trouble connecting to the synthesis engine. Please ensure the backend server is running on port 8001.";
      setChatHistory((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
    }
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
    <div className="h-screen w-full flex flex-col bg-transparent overflow-hidden relative">
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className="fixed inset-0 w-full h-full object-cover -z-20"
        src="/copilot-bg.mp4"
      />

      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[3px] -z-10"></div>



      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-8">
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
      <div className="relative z-10 w-full">
        <div className="max-w-3xl mx-auto pb-10 pt-2 px-6">
          <div className="relative flex items-center bg-slate-800/50 backdrop-blur-3xl border border-white/10 rounded-3xl p-1.5 shadow-2xl focus-within:border-indigo-500/50 transition-all">
            <textarea
              ref={textareaRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Predicto AI..."
              disabled={isLoading || isStreaming}
              className="flex-1 bg-transparent border-none px-4 py-3 text-white placeholder-slate-500 focus:outline-none resize-none max-h-48 disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
              rows={1}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSendMessage}
              disabled={!currentInput.trim() || isLoading || isStreaming}
              className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shrink-0"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </motion.button>
          </div>
          <p className="text-[10px] text-slate-600 text-center mt-3 uppercase tracking-widest font-bold opacity-50">
            Predicto AI can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}
