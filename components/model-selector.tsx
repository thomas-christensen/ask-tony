"use client";

import { useRef, useEffect, useState } from 'react';

const ALL_MODELS = [
  { value: 'auto', label: 'auto', cost: 'free' },
  { value: 'composer-1', label: 'composer-1', cost: 'low' },
  { value: 'gpt-5', label: 'gpt-5', cost: 'high' },
  { value: 'sonnet-4.5', label: 'sonnet-4.5', cost: 'high' },
  { value: 'grok', label: 'grok', cost: 'medium' },
];

// Get allowed models from environment variable (defaults to auto and composer-1 only)
const getAllowedModels = () => {
  const allowedModelsEnv = process.env.NEXT_PUBLIC_ALLOWED_MODELS;
  if (allowedModelsEnv) {
    const allowedValues = allowedModelsEnv.split(',').map(m => m.trim());
    return ALL_MODELS.filter(m => allowedValues.includes(m.value));
  }
  // Default: only allow auto and composer-1 (cost-effective models)
  return ALL_MODELS.filter(m => ['auto', 'composer-1'].includes(m.value));
};

const MODELS = getAllowedModels();

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ selectedModel, onModelChange, disabled }: ModelSelectorProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [selectWidth, setSelectWidth] = useState<number>(0);

  useEffect(() => {
    if (measureRef.current) {
      // Add a small buffer for the padding and arrow space
      setSelectWidth(measureRef.current.offsetWidth);
    }
  }, [selectedModel]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    onModelChange(newModel);
    
    // Update URL parameter
    const url = new URL(window.location.href);
    url.searchParams.set('model', newModel);
    window.history.pushState({}, '', url);
  };

  const selectedLabel = MODELS.find(m => m.value === selectedModel)?.label || selectedModel;
  
  return (
    <div className="relative">
      {/* Hidden span to measure text width */}
      <span
        ref={measureRef}
        className="absolute invisible text-xs sm:text-sm font-[inherit] whitespace-nowrap pl-2.5 sm:pl-3 pr-7 sm:pr-8"
        aria-hidden="true"
      >
        {selectedLabel}
      </span>
      <select
        ref={selectRef}
        value={selectedModel}
        onChange={handleChange}
        disabled={disabled}
        style={{ width: selectWidth > 0 ? `${selectWidth}px` : undefined }}
        className="appearance-none bg-muted/40 hover:bg-muted/60 transition-colors rounded-full pl-2.5 sm:pl-3 pr-7 sm:pr-8 py-1 text-xs sm:text-sm text-muted-foreground border-0 outline-none disabled:opacity-50 cursor-pointer"
      >
        {MODELS.map((model) => (
          <option key={model.value} value={model.value}>
            {model.label}
          </option>
        ))}
      </select>
      <svg 
        width="12" 
        height="12" 
        viewBox="0 0 12 12" 
        className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none"
      >
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
