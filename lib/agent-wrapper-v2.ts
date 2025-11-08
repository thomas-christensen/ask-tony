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
  model?: string
): Promise<void> {
  try {
    const modelToUse = model || process.env.CURSOR_MODEL || 'composer-1';
    
    // PHASE 1: Planning
    onUpdate({ 
      type: 'progress', 
      phase: 'planning', 
      message: 'Thinking',
      progress: 10
    });
    
    const plan = await planWidget(userMessage, modelToUse);
    console.log('📋 Plan:', plan);
    
    // Validate plan
    const planValidation = validatePlanSchema(plan);
    if (!planValidation.valid) {
      throw new Error(`Invalid plan: ${planValidation.errors.join(', ')}`);
    }
    
    // Stream plan to frontend for progressive skeleton
    onUpdate({ type: 'plan', plan: planValidation.plan });
    
    // PHASE 2: Data Fetching/Generation (if needed)
    let dataResult: DataResult | null = null;
    
    if (plan.needsWebSearch) {
      onUpdate({ 
        type: 'progress', 
        phase: 'searching', 
        message: 'Fetching data',
        progress: 40
      });
      
      dataResult = await fetchData(plan, userMessage, modelToUse);
    } else {
      onUpdate({ 
        type: 'progress', 
        phase: 'preparing', 
        message: 'Generating data',
        progress: 40
      });
      
      dataResult = await generateMockData(plan, userMessage, modelToUse);
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
      message: 'Generating UI',
      progress: 70
    });
    
    const widget = await generateWidget(plan, dataResult, userMessage, modelToUse);
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
    
  } catch (error) {
    console.error('❌ Agent orchestration error:', error);
    onUpdate({
      type: 'complete',
      response: {
        textResponse: error instanceof Error ? error.message : 'Error generating widget',
        error: true
      }
    });
  }
}

/**
 * Phase 1: Planning - Determine which widget type to use
 */
async function planWidget(query: string, model: string): Promise<PlanResult> {
  const result = await cursor.generateStream({
    prompt: query,
    systemPrompt: PLANNER_PROMPT,
    model,
    force: true
  });
  
  if (!result.success) {
    throw new Error('Planning failed: ' + (result.error || 'Unknown error'));
  }
  
  return extractJSON(result.finalText);
}

/**
 * Phase 2a: Fetch real data via web search
 */
async function fetchData(plan: PlanResult, query: string, model: string): Promise<DataResult> {
  const promptWithContext = DATA_PROMPT
    .replace('{widgetType}', plan.widgetType)
    .replace('{dataStructure}', plan.dataStructure);
  
  const result = await cursor.generateStreamWithCallback({
    prompt: `Extract structured data for: ${query}\nSearch query: ${plan.searchQuery}`,
    systemPrompt: promptWithContext,
    model,
    force: true
  }, (event) => {
    // Could stream search progress here if needed
    if (event.type === 'tool_call' && event.subtype === 'started') {
      console.log('🔍 Web search started');
    }
  });
  
  if (!result.success) {
    console.warn('⚠️ Data fetching failed, using fallback');
    return {
      data: {},
      source: null,
      confidence: 'low'
    };
  }
  
  return extractJSON(result.finalText);
}

/**
 * Phase 2b: Generate mock data when web search not needed
 */
async function generateMockData(plan: PlanResult, query: string, model: string): Promise<DataResult> {
  const promptWithContext = DATA_GENERATION_PROMPT
    .replace('{widgetType}', plan.widgetType)
    .replace('{dataStructure}', plan.dataStructure);
  
  const result = await cursor.generateStream({
    prompt: `Generate realistic data for: "${query}"
Widget type: ${plan.widgetType}
Key entities: ${plan.keyEntities.join(', ')}`,
    systemPrompt: promptWithContext,
    model,
    force: true
  });
  
  if (!result.success) {
    console.warn('⚠️ Mock data generation failed');
    return {
      data: {},
      source: null,
      confidence: 'low'
    };
  }
  
  return extractJSON(result.finalText);
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
  const result = await cursor.generateStream({
    prompt: `USER: "${query}"
Widget type: ${plan.widgetType}
Data structure: ${plan.dataStructure}
Available data: ${JSON.stringify(data?.data || {})}

Generate a widget JSON configuration that displays this data.`,
    systemPrompt: WIDGET_GENERATION_PROMPT,
    model,
    force: true
  });
  
  if (!result.success) {
    throw new Error('Widget generation failed: ' + (result.error || 'Unknown error'));
  }
  
  return extractJSON(result.finalText);
}

/**
 * Extract JSON from LLM response
 * More robust than code extraction - just finds JSON object
 */
function extractJSON(text: string): any {
  try {
    // Remove markdown code blocks if present
    const withoutMarkdown = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1');
    
    // Find JSON object (handles nested objects)
    const jsonMatch = withoutMarkdown.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Try parsing the whole text
    return JSON.parse(withoutMarkdown);
  } catch (error) {
    console.error('Failed to extract JSON:', error);
    console.error('Text was:', text.slice(0, 500));
    throw new Error('Failed to parse JSON response from LLM');
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function queryAgent(
  userMessage: string,
  model?: string
): Promise<WidgetResponse> {
  return new Promise((resolve) => {
    queryAgentStream(userMessage, (update) => {
      if (update.type === 'complete') {
        resolve(update.response);
      }
    }, model);
  });
}

