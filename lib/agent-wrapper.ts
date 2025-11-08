import { cursor } from './cursor-agent';
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
import type { Widget, WidgetResponse, PlanResult, DataResult } from './widget-schema';

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
  dataMode?: 'web-search' | 'example-data'
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
  dataMode?: 'web-search' | 'example-data'
): Promise<void> {
  const modelToUse = model || process.env.CURSOR_MODEL || 'composer-1';
  
  // Strategy 1: Try with original settings
  try {
    await executeNormalPipeline(userMessage, onUpdate, modelToUse, dataMode);
    return;
  } catch (error1) {
    console.warn('⚠️ Attempt 1 failed, trying alternative approach:', error1);
    
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
        console.warn('⚠️ Attempt 2 failed, using guaranteed fallback:', error2);
      }
    }
  }
  
  // Strategy 3: Guaranteed fallback widget (never throws)
  console.log('🛟 Using guaranteed fallback widget');
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
  dataMode?: 'web-search' | 'example-data'
): Promise<void> {
  // PHASE 1: Planning
  onUpdate({ 
    type: 'progress', 
    phase: 'planning', 
    message: 'Thinking ',
    progress: 10
  });
  
  const plan = await planWidget(userMessage, model);
  console.log('📋 Plan:', plan);
  
  // Validate plan
  const planValidation = validatePlanSchema(plan);
  if (!planValidation.valid) {
    throw new Error(`Invalid plan: ${planValidation.errors.join(', ')}`);
  }
  
  // Override needsWebSearch based on user's data mode selection
  if (dataMode === 'web-search') {
    planValidation.plan!.needsWebSearch = true;
  } else if (dataMode === 'example-data') {
    planValidation.plan!.needsWebSearch = false;
  }
  // If dataMode is undefined, use the plan's original decision
  
  const finalPlan = planValidation.plan!;
  
  // Stream plan to frontend for progressive skeleton
  onUpdate({ type: 'plan', plan: finalPlan });
  
  // PHASE 2: Data Fetching/Generation (if needed)
  let dataResult: DataResult | null = null;
  
  if (finalPlan.needsWebSearch) {
    onUpdate({ 
      type: 'progress', 
      phase: 'searching', 
      message: 'Searching the web',
      progress: 40
    });
    
    dataResult = await fetchData(finalPlan, userMessage, model);
  } else {
    onUpdate({ 
      type: 'progress', 
      phase: 'preparing', 
      message: 'Generating',
      progress: 40
    });
    
    dataResult = await generateMockData(finalPlan, userMessage, model);
  }
  
  console.log('📊 Data:', dataResult);
  
  // Validate data
  const dataValidation = validateDataSchema(dataResult);
  if (!dataValidation.valid) {
    console.warn('⚠️ Data validation warning:', dataValidation.errors);
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
  
  const widget = await generateWidget(finalPlan, dataResult, userMessage, model);
  console.log('🎨 Widget:', widget);
  
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
    console.warn('⚠️ Widget data issues:', dataCheck.errors);
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
      
      console.log(`🔄 ${phaseName} - Attempt ${attempt + 1}/${maxRetries + 1}${retryContext ? ' (retry with context)' : ''}`);
      
      const text = await llmCall(retryContext);
      lastText = text;
      
      // Extract and validate
      const parsed = extractJSON(text);
      const validation = validator(parsed);
      
      if (validation.valid) {
        console.log(`✅ ${phaseName} succeeded on attempt ${attempt + 1}`);
        // Return the validated data from the validator
        const validatedKey = Object.keys(validation).find(k => k !== 'valid' && k !== 'errors');
        return (validatedKey ? validation[validatedKey] : parsed) as T;
      }
      
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`⚠️ ${phaseName} attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt === maxRetries) {
        console.error(`❌ ${phaseName} failed after ${maxRetries + 1} attempts`);
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
  console.log('🛟 Creating fallback widget for failed generation');
  
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
  console.log('🛟 Creating fallback plan');
  
  return {
    widgetType: 'metric-card',
    needsWebSearch: false,
    searchQuery: null,
    dataStructure: 'single-value',
    keyEntities: [query]
  };
}

/**
 * Phase 1: Planning - Determine which widget type to use
 */
async function planWidget(query: string, model: string): Promise<PlanResult> {
  try {
    return await retryWithValidation<PlanResult>(
      async (retryContext) => {
        const result = await cursor.generateStream({
          prompt: query + (retryContext || ''),
          systemPrompt: PLANNER_PROMPT,
          model,
          force: true
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
    console.error('❌ Planning failed completely, using fallback plan');
    return createFallbackPlan(query);
  }
}

/**
 * Phase 2a: Fetch real data via web search
 * Exported for use by refresh endpoint
 */
export async function fetchData(plan: PlanResult, query: string, model: string): Promise<DataResult> {
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
          if (event.type === 'tool_call' && event.subtype === 'started') {
            console.log('🔍 Web search started');
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
    console.warn('⚠️ Data fetching failed completely, using empty fallback');
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
export async function generateMockData(plan: PlanResult, query: string, model: string): Promise<DataResult> {
  const promptWithContext = DATA_GENERATION_PROMPT
    .replace('{widgetType}', plan.widgetType)
    .replace('{dataStructure}', plan.dataStructure);
  
  try {
    return await retryWithValidation<DataResult>(
      async (retryContext) => {
        const result = await cursor.generateStream({
          prompt: `Generate realistic data for: "${query}"
Widget type: ${plan.widgetType}
Key entities: ${plan.keyEntities.join(', ')}${retryContext || ''}`,
          systemPrompt: promptWithContext,
          model,
          force: true
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
    console.warn('⚠️ Mock data generation failed completely, using empty fallback');
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
  model: string
): Promise<Widget> {
  try {
    return await retryWithValidation<Widget>(
      async (retryContext) => {
        const result = await cursor.generateStream({
          prompt: `USER: "${query}"
Widget type: ${plan.widgetType}
Data structure: ${plan.dataStructure}
Available data: ${JSON.stringify(data?.data || {})}

Generate a widget JSON configuration that displays this data.${retryContext || ''}`,
          systemPrompt: WIDGET_GENERATION_PROMPT,
          model,
          force: true
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
    console.error('❌ Widget generation failed completely, creating fallback widget');
    return createFallbackWidget(query, 'generating your visualization', error instanceof Error ? error.message : undefined);
  }
}

/**
 * Extract JSON from LLM response with aggressive error recovery
 * Handles malformed, truncated, and incomplete JSON
 */
function extractJSON(text: string): any {
  try {
    // Step 1: Remove markdown code blocks if present
    let cleanedText = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
    
    // Step 2: Find JSON object (handles nested objects)
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    
    let jsonStr = jsonMatch[0];
    
    // Step 3: Apply aggressive JSON repair strategies
    jsonStr = repairJSON(jsonStr);
    
    // Step 4: Try to parse
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('❌ JSON extraction failed:', error);
    console.error('📄 Original text (first 1000 chars):', text.slice(0, 1000));
    console.error('📄 Original text (last 500 chars):', text.slice(-500));
    
    // Throw with context for retry logic
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
 * Legacy function for backward compatibility
 */
export async function queryAgent(
  userMessage: string,
  model?: string,
  dataMode?: 'web-search' | 'example-data'
): Promise<WidgetResponse> {
  return new Promise((resolve) => {
    queryAgentStream(userMessage, (update) => {
      if (update.type === 'complete') {
        resolve(update.response);
      }
    }, model, dataMode);
  });
}

