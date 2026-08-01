'use client';

import { useState, useEffect } from 'react';

interface ResumeEditorProps {
  initialText: string;
  onSave?: (text: string) => void;
  readOnly?: boolean;
}

export default function ResumeEditor({ initialText, onSave, readOnly = false }: ResumeEditorProps) {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(true);
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync controlled prop, intentional
    setText(initialText);
    setSaved(true);
  }, [initialText]);

  const handleChange = (val: string) => {
    setText(val);
    setSaved(false);
    setHasHistory(true);
  };

  const handleSave = () => {
    onSave?.(text);
    setSaved(true);
  };

  const handleReset = () => {
    setText(initialText);
    setSaved(true);
  };

  if (readOnly) {
    return (
      <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
        {text || 'No optimized resume available'}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">EDIT MODE</span>
          {!saved && <span className="text-xs text-yellow-500">Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          {hasHistory && (
            <button onClick={handleReset}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors">
              Reset
            </button>
          )}
          <button onClick={handleSave} disabled={saved}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors">
            {saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        rows={20}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 resize-y font-sans leading-relaxed"
      />
      {/* Word count + estimated read time */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>~{text.split(/\s+/).filter(Boolean).length} words</span>
        <span>~{Math.ceil(text.split(/\s+/).filter(Boolean).length / 200)} min read</span>
      </div>
    </div>
  );
}
