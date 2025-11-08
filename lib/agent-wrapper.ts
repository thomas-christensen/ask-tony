import { cursor, CursorStreamEvent } from './cursor-agent';
import {
  PLANNER_PROMPT,
  DATA_PROMPT,
  DATA_GENERATION_PROMPT,
  WIDGET_GENERATION_PROMPT
} from './widget-prompts';
import {
  validateWidgetSchema,
  validatePlanSchema,
  validateDataSchema,
  validateWidgetData
} from './widget-validator';
import { queryMockDatabase } from './mock-database';
import { extractJSONWithRepair } from './json-extractor';
import type { Widget, WidgetResponse, PlanResult, DataResult } from './widget-schema';
import { agentLogger } from './agent-logger';

/**
 * Component configuration interface for chart components
 * Used for backward compatibility with chart rendering
 */
export interface ComponentConfig {
  colors?: string[];
  variant?: string;
  theme?: 'default' | 'vibrant' | 'minimal' | 'dark';
  showLabels?: boolean;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  orientation?: 'horizontal' | 'vertical';
  multiDataset?: boolean;
  grouping?: 'grouped' | 'stacked';
  showLegend?: boolean;
  showGrid?: boolean;
  showPoints?: boolean;
  title?: string;
  [key: string]: any;
}

/**
 * Simplified agent orchestration for widget-based generative UI
 * 
 * Flow: Plan → Data (if needed) → Widget Generation → Validation
 * 
 * This replaces the complex code generation pipeline with a simple,
 * reliable JSON generation approach.
 */

export async function queryAgentStream(
  userMessage: string,
  onUpdate: (update: any) => void,
  model?: string,
  dataMode?: 'web-search' | 'example-data' | 'mock-database'
): Promise<void> {
  // Use smart error recovery with fallback strategies
  await attemptWithFallbacks(userMessage, onUpdate, model, dataMode);
}

/**
 * Attempt widget generation with smart fallback strategies
 * Strategy 1: Try with original settings
 * Strategy 2: Force example data mode (faster, no web search costs)
 * Strategy 3: Guaranteed fallback widget (never fails)
 */
async function attemptWithFallbacks(
  userMessage: string,
  onUpdate: (update: any) => void,
  model?: string,
  dataMode?: 'web-search' | 'example-data' | 'mock-database'
): Promise<void> {
  const modelToUse = model || process.env.CURSOR_MODEL || 'composer-1';
  
  // Strategy 1: Try with original settings
  try {
    await executeNormalPipeline(userMessage, onUpdate, modelToUse, dataMode);
    return;
  } catch (error1) {
    agentLogger.warn(
      `Primary pipeline attempt failed (${describeError(error1)}); evaluating fallback`,
      { step: 'fallback', details: error1 }
    );
    
    // Only try fallback if we're not already using example data
    if (dataMode !== 'example-data') {
      // Strategy 2: Force example data mode (simpler, cheaper)
      try {
        onUpdate({ 
          type: 'progress', 
          phase: 'preparing', 
          message: 'Trying alternative approach',
          progress: 15
        });
        
        await executeNormalPipeline(userMessage, onUpdate, modelToUse, 'example-data');
        return;
      } catch (error2) {
        agentLogger.warn(
          `Example data fallback failed (${describeError(error2)}); using guaranteed widget`,
          { step: 'fallback', details: error2 }
        );
      }
    }
  }
  
  // Strategy 3: Guaranteed fallback widget (never throws)
  agentLogger.info('Falling back to guaranteed widget', { step: 'fallback' });
  const fallbackWidget = createFallbackWidget(
    userMessage,
    'processing your request',
    'Unable to generate widget with current settings'
  );
  
  onUpdate({
    type: 'complete',
    response: {
      widget: fallbackWidget,
      source: null
    }
  });
}

/**
 * Execute the normal 3-phase pipeline
 * This is the main generation logic extracted for reuse by fallback system
 */
async function executeNormalPipeline(
  userMessage: string,
  onUpdate: (update: any) => void,
  model: string,
  dataMode?: 'web-search' | 'example-data' | 'mock-database'
): Promise<void> {
  // PHASE 1: Planning
  onUpdate({
    type: 'progress',
    phase: 'planning',
    message: 'Thinking ',
    progress: 10
  });

  const plan = await planWidget(userMessage, model, onUpdate);
  agentLogger.info(describePlan(plan), {
    step: 'planning',
    details: plan
  });
  
  // Validate plan
  const planValidation = validatePlanSchema(plan);
  if (!planValidation.valid) {
    throw new Error(`Invalid plan: ${planValidation.errors.join(', ')}`);
  }

  // Override dataSource based on user's data mode selection (for backward compatibility)
  if (dataMode === 'web-search') {
    planValidation.plan!.dataSource = 'web-search';
  } else if (dataMode === 'example-data') {
    planValidation.plan!.dataSource = 'example-data';
  } else if (dataMode === 'mock-database') {
    planValidation.plan!.dataSource = 'mock-database';
  }
  // If dataMode is undefined, use the plan's original dataSource decision

  const finalPlan = planValidation.plan!;

  // Stream plan to frontend for progressive skeleton
  onUpdate({ type: 'plan', plan: finalPlan });

  // PHASE 2: Data Fetching/Generation
  let dataResult: DataResult | null = null;

  switch (finalPlan.dataSource) {
    case 'mock-database':
      agentLogger.info('Querying mock database', {
        step: 'data',
        details: { widgetType: finalPlan.widgetType, dataStructure: finalPlan.dataStructure, queryIntent: finalPlan.queryIntent }
      });
      onUpdate({
        type: 'progress',
        phase: 'querying',
        message: 'Querying database',
        progress: 40
      });

      dataResult = await queryMockDatabase(finalPlan, userMessage, model);
      break;

    case 'web-search':
      agentLogger.info(describeWebSearch(finalPlan), {
        step: 'data',
        details: { searchQuery: finalPlan.searchQuery, widgetType: finalPlan.widgetType }
      });
      onUpdate({
        type: 'progress',
        phase: 'searching',
        message: 'Searching the web',
        progress: 40
      });

      dataResult = await fetchData(finalPlan, userMessage, model, onUpdate);
      break;

    case 'example-data':
    default:
      agentLogger.info(describeMockDataPath(finalPlan), {
        step: 'data',
        details: { widgetType: finalPlan.widgetType, dataStructure: finalPlan.dataStructure }
      });
      onUpdate({
        type: 'progress',
        phase: 'preparing',
        message: 'Generating',
        progress: 40
      });

      dataResult = await generateMockData(finalPlan, userMessage, model, onUpdate);
      break;
  }

  agentLogger.info(describeDataResult(dataResult), {
    step: 'data',
    details: dataResult
  });

  // Validate data
  const dataValidation = validateDataSchema(dataResult);
  if (!dataValidation.valid) {
    agentLogger.warn(
      `Data validation reported ${dataValidation.errors.length} issue(s)`,
      { step: 'data', details: dataValidation.errors }
    );
    // Continue anyway - widget generation can handle it
  }

  // Stream data to frontend for progressive skeleton
  onUpdate({ type: 'data', dataResult });

  // PHASE 3: Widget Generation
  onUpdate({
    type: 'progress',
    phase: 'generating',
    message: 'Building UI',
    progress: 70
  });

  const widget = await generateWidget(finalPlan, dataResult, userMessage, model, onUpdate);
  agentLogger.info(describeWidget(widget, finalPlan), {
    step: 'widget',
    details: widget
  });
  
  // PHASE 4: Validation
  onUpdate({ 
    type: 'progress', 
    phase: 'validating', 
    message: 'Validating',
    progress: 90
  });
  
  const widgetValidation = validateWidgetSchema(widget);
  if (!widgetValidation.valid) {
    throw new Error(`Widget validation failed: ${widgetValidation.errors.join(', ')}`);
  }
  
  // Additional data validation
  const dataCheck = validateWidgetData(widgetValidation.widget!);
  if (!dataCheck.valid) {
    agentLogger.warn(
      `Widget data validation reported ${dataCheck.errors.length} issue(s)`,
      { step: 'validation', details: dataCheck.errors }
    );
    // Continue - renderer can handle missing data gracefully
  }
  
  // Success
  onUpdate({
    type: 'complete',
    response: {
      widget: widgetValidation.widget,
      source: dataResult?.source || null
    }
  });
}

/**
 * Retry wrapper that includes validation feedback in retry prompts
 */
async function retryWithValidation<T>(
  llmCall: (retryContext?: string) => Promise<string>,
  validator: (data: any) => { valid: boolean; errors: string[]; [key: string]: any },
  phaseName: string,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  let lastText: string = '';
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On retry, add error context to help LLM fix the issue
      const retryContext = attempt > 0 
        ? `\n\nPREVIOUS ATTEMPT FAILED: ${lastError?.message}\nPlease fix these issues and return valid JSON.`
        : undefined;
      
      agentLogger.info(
        `${phaseName} attempt ${attempt + 1}/${maxRetries + 1}`,
        {
          step: phaseName,
          details: retryContext ? 'retrying with validation context' : undefined
        }
      );
      
      const text = await llmCall(retryContext);
      lastText = text;
      
      // Extract and validate
      const parsed = extractJSON(text);
      const validation = validator(parsed);
      
      if (validation.valid) {
        agentLogger.info(`${phaseName} succeeded`, {
          step: phaseName,
          details: `attempt ${attempt + 1}`
        });
        // Return the validated data from the validator
        const validatedKey = Object.keys(validation).find(k => k !== 'valid' && k !== 'errors');
        return (validatedKey ? validation[validatedKey] : parsed) as T;
      }
      
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      agentLogger.warn(
        `${phaseName} attempt ${attempt + 1} failed (${describeError(lastError)})`,
        { step: phaseName, details: lastError }
      );
      
      if (attempt === maxRetries) {
        agentLogger.error(
          `${phaseName} failed after ${maxRetries + 1} attempts`,
          { step: phaseName, details: lastError }
        );
        throw lastError;
      }
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw lastError || new Error(`${phaseName} failed`);
}

/**
 * Create a fallback widget when all else fails
 * This NEVER throws - always returns a valid widget
 */
function createFallbackWidget(query: string, phase: string, error?: string): Widget {
  agentLogger.info('Creating fallback widget', {
    step: 'fallback',
    details: error ? `reason: ${error}` : undefined
  });
  
  return {
    type: 'metric-card',
    data: {
      label: 'Unable to complete request',
      value: '⚠️',
      description: `I encountered an issue while ${phase}. Please try rephrasing your question or try again.`,
      context: query,
    },
    config: {
      variant: 'warning',
      size: 'md'
    }
  };
}

/**
 * Create a fallback plan when planning fails
 */
function createFallbackPlan(query: string): PlanResult {
  agentLogger.info('Creating fallback plan', { step: 'fallback' });

  return {
    widgetType: 'metric-card',
    dataSource: 'example-data',
    searchQuery: null,
    queryIntent: null,
    dataStructure: 'single-value',
    keyEntities: [query],
    reasoning: 'Fallback plan due to planning failure'
  };
}

/**
 * Phase 1: Planning - Determine which widget type to use
 */
async function planWidget(
  query: string,
  model: string,
  onUpdate?: (update: any) => void
): Promise<PlanResult> {
  try {
    return await retryWithValidation<PlanResult>(
      async (retryContext) => {
        const result = await cursor.generateStreamWithCallback({
          prompt: query + (retryContext || ''),
          systemPrompt: PLANNER_PROMPT,
          model,
          force: true
        }, (event) => {
          // Stream agent events to frontend
          if (onUpdate) {
            streamAgentEvent(event, onUpdate, 'planning');
          }
        });

        if (!result.success) {
          throw new Error('LLM call failed: ' + (result.error || 'Unknown error'));
        }

        return result.finalText;
      },
      validatePlanSchema,
      'Planning phase',
      2
    );
  } catch (error) {
    agentLogger.error('Planning failed after retries; using fallback plan', {
      step: 'planning',
      details: error
    });
    return createFallbackPlan(query);
  }
}

/**
 * Phase 2a: Fetch real data via web search
 * Exported for use by refresh endpoint
 */
export async function fetchData(
  plan: PlanResult,
  query: string,
  model: string,
  onUpdate?: (update: any) => void
): Promise<DataResult> {
  const promptWithContext = DATA_PROMPT
    .replace('{widgetType}', plan.widgetType)
    .replace('{dataStructure}', plan.dataStructure);

  try {
    return await retryWithValidation<DataResult>(
      async (retryContext) => {
        const result = await cursor.generateStreamWithCallback({
          prompt: `Extract structured data for: ${query}\nSearch query: ${plan.searchQuery}${retryContext || ''}`,
          systemPrompt: promptWithContext,
          model,
          force: true
        }, (event) => {
          if (onUpdate) {
            streamAgentEvent(event, onUpdate, 'searching');
          }
          if (event.type === 'tool_call' && event.subtype === 'started') {
            agentLogger.info('Web search started', { step: 'data' });
          }
        });

        if (!result.success) {
          throw new Error('LLM call failed: ' + (result.error || 'Unknown error'));
        }

        return result.finalText;
      },
      validateDataSchema,
      'Data fetching phase',
      2
    );
  } catch (error) {
    agentLogger.warn(
      `Data fetching failed (${describeError(error)}); using empty fallback`,
      { step: 'data', details: error }
    );
    return {
      data: {},
      source: null,
      confidence: 'low'
    };
  }
}

/**
 * Phase 2b: Generate mock data when web search not needed
 * Exported for use by refresh endpoint
 */
export async function generateMockData(
  plan: PlanResult,
  query: string,
  model: string,
  onUpdate?: (update: any) => void
): Promise<DataResult> {
  const promptWithContext = DATA_GENERATION_PROMPT
    .replace('{widgetType}', plan.widgetType)
    .replace('{dataStructure}', plan.dataStructure);

  try {
    return await retryWithValidation<DataResult>(
      async (retryContext) => {
        const result = await cursor.generateStreamWithCallback({
          prompt: `Generate realistic data for: "${query}"
Widget type: ${plan.widgetType}
Key entities: ${plan.keyEntities.join(', ')}${retryContext || ''}`,
          systemPrompt: promptWithContext,
          model,
          force: true
        }, (event) => {
          if (onUpdate) {
            streamAgentEvent(event, onUpdate, 'preparing');
          }
        });

        if (!result.success) {
          throw new Error('LLM call failed: ' + (result.error || 'Unknown error'));
        }

        return result.finalText;
      },
      validateDataSchema,
      'Mock data generation phase',
      2
    );
  } catch (error) {
    agentLogger.warn(
      `Mock data generation failed (${describeError(error)}); using empty fallback`,
      { step: 'data', details: error }
    );
    return {
      data: {},
      source: null,
      confidence: 'low'
    };
  }
}

/**
 * Phase 3: Generate widget JSON configuration
 */
async function generateWidget(
  plan: PlanResult,
  data: DataResult | null,
  query: string,
  model: string,
  onUpdate?: (update: any) => void
): Promise<Widget> {
  try {
    return await retryWithValidation<Widget>(
      async (retryContext) => {
        const result = await cursor.generateStreamWithCallback({
          prompt: `USER: "${query}"
Widget type: ${plan.widgetType}
Data structure: ${plan.dataStructure}
Available data: ${JSON.stringify(data?.data || {})}

Generate a widget JSON configuration that displays this data.${retryContext || ''}`,
          systemPrompt: WIDGET_GENERATION_PROMPT,
          model,
          force: true
        }, (event) => {
          if (onUpdate) {
            streamAgentEvent(event, onUpdate, 'generating');
          }
        });

        if (!result.success) {
          throw new Error('LLM call failed: ' + (result.error || 'Unknown error'));
        }

        return result.finalText;
      },
      validateWidgetSchema,
      'Widget generation phase',
      2
    );
  } catch (error) {
    agentLogger.error(
      'Widget generation failed after retries; creating fallback widget',
      { step: 'widget', details: error }
    );
    return createFallbackWidget(
      query,
      'generating your visualization',
      error instanceof Error ? error.message : undefined
    );
  }
}

/**
 * Extract JSON from LLM response with aggressive error recovery
 * Wrapper around extractJSONWithRepair that uses repairJSON strategy
 */
function extractJSON(text: string): any {
  try {
    return extractJSONWithRepair(text, repairJSON);
  } catch (error) {
    agentLogger.error('JSON extraction failed', { step: 'parsing', details: error });
    if (agentLogger.isDebugEnabled()) {
      agentLogger.debug('Original text (first 1000 chars)', {
        step: 'parsing',
        details: text.slice(0, 1000)
      });
      agentLogger.debug('Original text (last 500 chars)', {
        step: 'parsing',
        details: text.slice(-500)
      });
    }
    throw error;
  }
}

/**
 * Repair malformed JSON with multiple strategies
 */
function repairJSON(jsonStr: string): string {
  let fixed = jsonStr;
  
  // Strategy 1: Remove trailing commas before closing brackets/braces
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  // Strategy 2: Fix incomplete string values (unclosed quotes at end)
  // Match strings that might be truncated
  const lastQuoteIndex = fixed.lastIndexOf('"');
  const lastBraceIndex = Math.max(fixed.lastIndexOf('}'), fixed.lastIndexOf(']'));
  if (lastQuoteIndex > lastBraceIndex) {
    // We have an unclosed quote - close it
    const beforeQuote = fixed.slice(0, lastQuoteIndex + 1);
    const afterQuote = fixed.slice(lastQuoteIndex + 1);
    // Find if we're in a string value
    if (afterQuote.match(/^[^"]*$/)) {
      fixed = beforeQuote + '"' + afterQuote;
    }
  }
  
  // Strategy 3: Balance brackets and braces
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  
  // Strategy 4: Remove incomplete key-value pairs at the end
  // Look for patterns like: ,"key": or ,"key" at the end
  fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, '');
  fixed = fixed.replace(/,\s*"[^"]*"?\s*$/, '');
  
  // Strategy 5: Add missing closing brackets (arrays first, then objects)
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    fixed += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    fixed += '}';
  }
  
  // Strategy 6: Fix unescaped quotes inside strings (basic attempt)
  // This is tricky, so we do a simple pass
  fixed = fixed.replace(/"([^"]*)"([^":])/g, (match, content, after) => {
    // If content has unescaped quotes, escape them
    if (content.includes('"')) {
      return `"${content.replace(/"/g, '\\"')}"${after}`;
    }
    return match;
  });
  
  return fixed;
}

/**
 * Stream cursor-agent events to the frontend
 * Converts low-level cursor events into user-friendly messages
 */

// Track thinking delta count per phase to show periodic updates
const thinkingCounters: Record<string, number> = {};
const lastMessageTime: Record<string, number> = {};

function streamAgentEvent(
  event: CursorStreamEvent,
  onUpdate: (update: any) => void,
  phase: string
): void {
  let eventMessage: string | null = null;

  // Fun, personality-driven messages based on phase
  const phaseMessages = {
    planning: {
      init: ['Waking up Tony...', 'Initializing Tony...', 'Booting up...'],
      thinking: [
        'Analyzing your question...',
        'Understanding the request...',
        'Figuring things out...',
        'Mapping the strategy...',
        'Connecting the dots...',
        'Planning the approach...',
      ],
      complete: ['Planning next steps...', 'Moving forward...', 'Preparing data phase...']
    },
    querying: {
      init: ['Opening the vault...', 'Diving into data...', 'Accessing database...'],
      thinking: [
        'Crunching numbers...',
        'Analyzing records...',
        'Scanning data...',
        'Filtering results...',
        'Sorting information...',
        'Extracting insights...',
      ],
      complete: ['Moving to design...', 'Starting build phase...', 'Preparing components...']
    },
    searching: {
      init: ['Searching the web...', 'Going online...', 'Fetching live data...'],
      thinking: [
        'Scanning results...',
        'Gathering information...',
        'Reading sources...',
        'Verifying data...',
        'Cross-referencing...',
        'Compiling findings...',
      ],
      complete: ['Moving to design...', 'Starting build phase...', 'Preparing components...']
    },
    preparing: {
      init: ['Generating data...', 'Creating examples...', 'Building dataset...'],
      thinking: [
        'Crafting realistic data...',
        'Making it look good...',
        'Adding details...',
        'Structuring information...',
        'Fine-tuning values...',
        'Balancing the dataset...',
      ],
      complete: ['Moving to design...', 'Starting build phase...', 'Preparing components...']
    },
    generating: {
      init: ['Building your chart...', 'Crafting the UI...', 'Assembling components...'],
      thinking: [
        'Polishing the design...',
        'Adding colors...',
        'Fine-tuning layout...',
        'Adjusting spacing...',
        'Choosing the perfect palette...',
        'Making it beautiful...',
      ],
      complete: ['Running final checks...', 'Reviewing the build...', 'Validating everything...']
    },
    validating: {
      init: ['Quality check...', 'Reviewing work...', 'Final inspection...'],
      thinking: [
        'Checking everything...',
        'Making sure it\'s perfect...',
        'Validating data...',
        'Running tests...',
        'Verifying accuracy...',
        'Double-checking...',
      ],
      complete: ['Wrapping up...', 'Finalizing details...', 'Getting ready...']
    }
  };

  // Get messages for current phase
  const messages = phaseMessages[phase as keyof typeof phaseMessages] || phaseMessages.planning;

  // Throttle messages - only send one every 2 seconds per phase
  const now = Date.now();
  const timeSinceLastMessage = now - (lastMessageTime[phase] || 0);
  const THROTTLE_MS = 2000; // 2 seconds between updates

  // Handle different event types from cursor-agent
  if (event.type === 'thinking') {
    if (event.subtype === 'delta') {
      // Initialize counter for this phase if not exists
      if (!thinkingCounters[phase]) {
        thinkingCounters[phase] = 0;
      }

      thinkingCounters[phase]++;

      // Only send if enough time has passed
      if (timeSinceLastMessage < THROTTLE_MS) {
        return;
      }

      // Show thinking messages sequentially
      const thinkingMessages = messages.thinking;
      const index = Math.floor(thinkingCounters[phase] / 15) % thinkingMessages.length;
      eventMessage = thinkingMessages[index];
    } else if (event.subtype === 'completed') {
      // Reset counter for next phase
      thinkingCounters[phase] = 0;
      eventMessage = messages.complete[Math.floor(Math.random() * messages.complete.length)];
    }
  } else if (event.type === 'system') {
    if (event.subtype === 'init') {
      eventMessage = messages.init[Math.floor(Math.random() * messages.init.length)];
    } else if (event.subtype === 'session_start') {
      eventMessage = messages.init[Math.floor(Math.random() * messages.init.length)];
    }
  } else if (event.type === 'tool_call') {
    // Extract tool name from tool_call event
    const toolName = event.tool_call?.name || 'tool';

    if (toolName === 'WebSearch' || toolName === 'web_search') {
      eventMessage = 'Searching the internet...';
    } else if (toolName === 'Read' || toolName === 'read') {
      eventMessage = 'Reading data...';
    } else if (toolName === 'Grep' || toolName === 'grep') {
      eventMessage = 'Scanning records...';
    } else if (event.subtype === 'started') {
      eventMessage = messages.thinking[Math.floor(Math.random() * messages.thinking.length)];
    } else if (event.subtype === 'finished') {
      eventMessage = messages.complete[Math.floor(Math.random() * messages.complete.length)];
    }
  } else if (event.type === 'assistant' && event.message?.content?.[0]?.text) {
    // Stream first line of assistant reasoning
    const text = event.message.content[0].text;
    const firstLine = text.split('\n')[0].trim();

    // Only show if it's meaningful (not just JSON or code)
    if (firstLine.length > 10 &&
        firstLine.length < 100 &&
        !firstLine.startsWith('{') &&
        !firstLine.startsWith('[') &&
        !firstLine.startsWith('```')) {
      eventMessage = firstLine;
    }
  } else if (event.type === 'result') {
    if (event.subtype === 'success') {
      eventMessage = messages.complete[Math.floor(Math.random() * messages.complete.length)];
    }
  }

  // Send the event to frontend if we have a message
  if (eventMessage) {
    lastMessageTime[phase] = now;
    onUpdate({
      type: 'agent_event',
      phase,
      message: eventMessage,
      timestamp: Date.now()
    });
  }
}

function describePlan(plan: PlanResult): string {
  const webSearchPart = plan.dataSource === 'web-search'
    ? `will search the web using "${formatSearchQuery(plan.searchQuery || null)}"`
    : plan.dataSource === 'mock-database'
    ? "will query the mock database"
    : "does not require a web search";
  const keyEntities =
    plan.keyEntities && plan.keyEntities.length > 0
      ? `focusing on ${plan.keyEntities.map(entity => `"${entity}"`).join(", ")}`
      : "with no specific key entities";
  return `Plan ready: build a ${plan.widgetType} (${plan.dataStructure}) that ${webSearchPart}, ${keyEntities}.`;
}

function describeWebSearch(plan: PlanResult): string {
  return `Searching the web for "${formatSearchQuery(plan.searchQuery || null)}" to gather real data for the ${plan.widgetType}.`;
}

function describeMockDataPath(plan: PlanResult): string {
  return `Generating example data for the ${plan.widgetType} (${plan.dataStructure}) without web search.`;
}

function describeDataResult(data: DataResult | null): string {
  if (!data) {
    return "Data phase skipped (no data required).";
  }

  const fieldCount = data.data ? Object.keys(data.data).length : 0;
  const confidence = data.confidence ? `${data.confidence} confidence` : "unknown confidence";
  const source = data.source ? `source: ${truncate(data.source, 80)}` : "no source provided";
  const hasContent = fieldCount > 0 ? `${fieldCount} field${fieldCount === 1 ? "" : "s"} ready` : "no structured fields returned";

  return `Data ready: ${hasContent}, ${confidence}, ${source}.`;
}

function describeWidget(widget: Widget, plan: PlanResult): string {
  const dataKeys =
    widget && typeof widget === 'object' && widget.data
      ? Object.keys(widget.data)
      : [];

  const configPart = widget.config ? "custom config applied" : "default styling";
  const fieldCount = dataKeys.length;
  const fieldPart = fieldCount > 0
    ? `${fieldCount} data field${fieldCount === 1 ? "" : "s"}`
    : "no data fields";

  return `Widget ready: ${plan.widgetType} displaying ${fieldPart} with ${configPart}.`;
}

function formatSearchQuery(searchQuery: string | null): string {
  if (searchQuery && searchQuery.trim().length > 0) {
    return truncate(searchQuery.trim(), 80);
  }
  return "auto-generated query";
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length - 3)}...`;
}

/**
 * Legacy function for backward compatibility
 */
export async function queryAgent(
  userMessage: string,
  model?: string,
  dataMode?: 'web-search' | 'example-data' | 'mock-database'
): Promise<WidgetResponse> {
  return new Promise((resolve) => {
    queryAgentStream(userMessage, (update) => {
      if (update.type === 'complete') {
        resolve(update.response);
      }
    }, model, dataMode);
  });
}

