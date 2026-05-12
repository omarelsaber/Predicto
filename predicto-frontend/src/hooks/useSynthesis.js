import { useState, useCallback } from 'react';
import { API_ORIGIN } from '../api';

export const useSynthesis = () => {
  const [summary, setSummary] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const streamSummary = useCallback(async (query) => {
    setSummary(""); setMeta(null); setError(null); setLoading(true);
    try {
      const response = await fetch(`${API_ORIGIN}/api/v1/synthesise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'meta') setMeta(data);
            if (data.type === 'chunk') setSummary(prev => prev + data.text);
            if (data.type === 'error') setError(data.message);
            if (data.type === 'done') setLoading(false);
          }
        }
      }
    } catch (err) {
      setError("Connection lost.");
      setLoading(false);
    }
  }, []);

  return { summary, meta, loading, error, streamSummary };
};
