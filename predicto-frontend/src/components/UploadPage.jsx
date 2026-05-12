import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import api from '../api';

export default function UploadPage({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(''); // 'uploading' | 'ingesting' | 'training' | 'done' | 'error'
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const stages = [
    { key: 'uploading',  label: 'Uploading CSV…',                  pct: 15  },
    { key: 'ingesting',  label: 'Parsing & validating data…',      pct: 35  },
    { key: 'training',   label: 'Training ML models…',             pct: 70  },
    { key: 'done',       label: 'All models trained successfully!', pct: 100 },
  ];

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const f = droppedFiles[0];
      if (f.name.endsWith('.csv')) {
        setFile(f);
        setError(null);
      } else {
        setError('Please upload a .csv file');
      }
    }
  }, []);

  const handleFileInput = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.name.endsWith('.csv')) {
        setFile(f);
        setError(null);
      } else {
        setError('Please upload a .csv file');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    // Simulate progress stages
    setStage('uploading');
    setProgress(15);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 2. Ingest stage
      setStage('ingesting');
      setProgress(40);
      
      const response = await api.post('/ingest', formData, {
        timeout: 180000, // 3 minute timeout for deep ML training
      });

      // 3. Finalize
      setStage('done');
      setProgress(100);
      setResult(response.data);

      // Success! Brief pause so user sees the 100% state, then redirect
      setTimeout(() => {
        if (onUploadComplete) {
          onUploadComplete(response.data);
        }
      }, 1000);

    } catch (err) {
      console.error("Upload failed:", err);
      setStage('error');
      setProgress(0);
      
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'object' ? detail.message : detail || err.message;
      setError(message || 'Upload failed. Please ensure your CSV follows the required format.');
    } finally {
      setUploading(false);
    }
  };

  const currentStageIndex = stages.findIndex(s => s.key === stage);

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-2 flex items-center gap-3">
          <Sparkles className="text-brand-primary" size={28} />
          Upload Your Data
        </h2>
        <p className="text-gray-400 max-w-2xl">
          Drop your CSV file to instantly re-train all ML models — forecasting, margin engine, and customer segmentation will adapt to your data in real-time.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        {/* Upload Zone */}
        <div className="xl:col-span-3">
          <div
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer backdrop-blur-2xl
              ${isDragging
                ? 'border-brand-primary bg-brand-primary/10 shadow-[0_0_40px_rgba(59,130,246,0.15)]'
                : 'border-white/5 bg-slate-900/30 hover:border-white/10 hover:bg-slate-900/40 shadow-2xl'
              }
              ${file ? 'border-emerald-500/30 bg-emerald-500/10' : ''}
            `}
            onClick={() => document.getElementById('csv-input').click()}
          >
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
              disabled={uploading}
            />

            <AnimatePresence mode="wait">
              {!file ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center"
                >
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-all ${
                    isDragging
                      ? 'bg-brand-primary/20 border border-brand-primary/40'
                      : 'bg-gray-800/60 border border-gray-700'
                  }`}>
                    <Upload size={36} className={isDragging ? 'text-brand-primary' : 'text-gray-400'} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    {isDragging ? 'Drop your CSV here' : 'Drag & Drop your CSV'}
                  </h3>
                  <p className="text-gray-500 text-sm mb-4">or click to browse files</p>
                  <p className="text-xs text-gray-600">
                    Required: Order ID, Order Date, Customer, Segment, Region, Product, Sales, Quantity, Discount
                    <span className="block mt-1 text-gray-700">Optional: Industry, Profit</span>
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-4">
                    <FileSpreadsheet size={30} className="text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{file.name}</h3>
                  <p className="text-gray-400 text-sm">{(file.size / 1024).toFixed(1)} KB</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Button */}
          {file && !uploading && stage !== 'done' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <button
                onClick={handleUpload}
                className="w-full bg-brand-primary hover:bg-blue-600 active:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-[0_0_25px_rgba(59,130,246,0.3)] hover:shadow-[0_0_35px_rgba(59,130,246,0.5)] flex items-center justify-center gap-3 text-lg"
              >
                <Sparkles size={20} />
                Upload & Train Models
              </button>
            </motion.div>
          )}

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex gap-3 items-start"
              >
                <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-300">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress / Status Panel */}
        <div className="xl:col-span-2">
          <div className="bg-slate-950/40 backdrop-blur-2xl border border-white/5 rounded-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.4)] h-full flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-brand-accent rounded-full inline-block"></span>
              Training Pipeline
            </h3>

            {!stage && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
                  <Upload size={24} className="text-gray-500" />
                </div>
                <p className="text-gray-500 text-sm">Upload a CSV to begin</p>
              </div>
            )}

            {stage && (
              <div className="space-y-4 flex-1">
                {/* Progress Bar */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Progress</span>
                    <span className="text-sm font-bold text-white">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${stage === 'error' ? 'bg-rose-500' : stage === 'done' ? 'bg-emerald-500' : 'bg-brand-primary'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Stage Steps */}
                <div className="space-y-3">
                  {stages.map((s, i) => {
                    const isActive = s.key === stage;
                    const isComplete = currentStageIndex > i;
                    const isPending = currentStageIndex < i;

                    return (
                      <div
                        key={s.key}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                          isActive ? 'bg-brand-primary/10 border border-brand-primary/20' :
                          isComplete ? 'bg-emerald-500/5 border border-emerald-500/10' :
                          'border border-transparent'
                        }`}
                      >
                        <div className="shrink-0">
                          {isComplete ? (
                            <CheckCircle2 size={18} className="text-emerald-400" />
                          ) : isActive ? (
                            <Loader2 size={18} className="text-brand-primary animate-spin" />
                          ) : (
                            <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-700" />
                          )}
                        </div>
                        <span className={`text-sm font-medium ${
                          isActive ? 'text-white' :
                          isComplete ? 'text-emerald-400' :
                          'text-gray-600'
                        }`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Result Stats */}
                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 space-y-4"
                    >
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
                        <h4 className="text-sm font-bold text-emerald-400 mb-3">✓ Pipeline Complete</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Rows Loaded</span>
                            <span className="text-white font-semibold">{result.rows_raw?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Monthly Periods</span>
                            <span className="text-white font-semibold">{result.rows_monthly}</span>
                          </div>
                          {result.rows_dropped > 0 && (
                            <div className="flex justify-between">
                              <span className="text-yellow-400">Rows Dropped</span>
                              <span className="text-yellow-400 font-semibold">{result.rows_dropped?.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        <p className="mt-3 text-xs text-emerald-400/80">Redirecting to Dashboard…</p>
                      </div>

                      {/* Validation Errors */}
                      {result.validation_errors?.length > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                          <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <AlertCircle size={14} />
                            Data Quality Issues ({result.validation_errors.length})
                          </h4>
                          <ul className="space-y-1.5">
                            {result.validation_errors.map((err, i) => (
                              <li key={i} className="text-xs text-yellow-300/80 flex gap-2">
                                <span className="text-yellow-500 shrink-0">•</span>
                                <span>{err}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Warnings */}
                      {result.warnings?.length > 0 && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                          <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">
                            Notices
                          </h4>
                          <ul className="space-y-1">
                            {result.warnings.map((w, i) => (
                              <li key={i} className="text-xs text-blue-300/80 flex gap-2">
                                <span className="text-blue-500 shrink-0">ℹ</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
