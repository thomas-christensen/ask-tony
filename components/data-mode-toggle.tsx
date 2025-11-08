"use client";

import { SearchIcon, SparklesIcon } from './icons';

export type DataMode = 'web-search' | 'example-data';

interface DataModeToggleProps {
  dataMode: DataMode | undefined;
  onDataModeChange: (mode: DataMode | undefined) => void;
  disabled?: boolean;
}

export function DataModeToggle({ dataMode, onDataModeChange, disabled }: DataModeToggleProps) {
  const handleClick = () => {
    // Cycle through: undefined (auto) -> web-search -> example-data -> undefined
    let newMode: DataMode | undefined;
    if (dataMode === undefined) {
      newMode = 'web-search';
    } else if (dataMode === 'web-search') {
      newMode = 'example-data';
    } else {
      newMode = undefined;
    }

    onDataModeChange(newMode);

    // Update URL parameter
    const url = new URL(window.location.href);
    if (newMode === undefined) {
      url.searchParams.delete('dataMode');
    } else {
      url.searchParams.set('dataMode', newMode);
    }
    window.history.pushState({}, '', url);
  };

  const isWebSearch = dataMode === 'web-search';
  const isAuto = dataMode === undefined;
  const label = isAuto ? 'auto' : (isWebSearch ? 'web' : 'mock');
  const Icon = isWebSearch ? SearchIcon : SparklesIcon;

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      type="button"
      className="appearance-none bg-muted/40 hover:bg-muted/60 transition-colors rounded-full pl-2.5 sm:pl-3 pr-2.5 sm:pr-3 py-1 text-xs sm:text-sm text-muted-foreground border-0 outline-none disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
    >
      <Icon />
      <span>{label}</span>
    </button>
  );
}

