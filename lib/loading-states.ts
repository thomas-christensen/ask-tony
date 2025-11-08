export type LoadingPhase = 
  | 'analyzing'
  | 'planning'
  | 'searching'
  | 'extracting'
  | 'preparing'
  | 'designing'
  | 'generating'
  | 'validating'
  | 'reviewing'
  | 'complete';

export interface LoadingState {
  phase: LoadingPhase;
  message: string;
  progress: number;
  subtext?: string;
  agentEvent?: AgentEvent; // Real-time events from cursor-agent
}

export interface AgentEvent {
  type: 'tool_call' | 'assistant' | 'system';
  message: string;
  timestamp: number;
}

export function getLoadingState(phase: LoadingPhase): LoadingState {
  const states: Record<LoadingPhase, LoadingState> = {
    analyzing: { phase: 'analyzing', message: 'Thinking', progress: 5, subtext: 'Analyzing intent and requirements' },
    planning: { phase: 'planning', message: 'Planning', progress: 10, subtext: 'Determining widget type' },
    searching: { phase: 'searching', message: 'Searching the web', progress: 40, subtext: 'Searching for live data' },
    extracting: { phase: 'extracting', message: 'Parsing', progress: 50, subtext: 'Extracting structured data' },
    preparing: { phase: 'preparing', message: 'Generating', progress: 40, subtext: 'Creating example data' },
    designing: { phase: 'designing', message: 'Designing the interface', progress: 65, subtext: 'Creating interactive layout' },
    generating: { phase: 'generating', message: 'Generating UI', progress: 70, subtext: 'Building interface' },
    validating: { phase: 'validating', message: 'Finalizing', progress: 90, subtext: 'Checking structure' },
    reviewing: { phase: 'reviewing', message: 'Reviewing', progress: 95, subtext: 'Final polish' },
    complete: { phase: 'complete', message: 'Complete', progress: 100 }
  };
  
  return states[phase];
}

