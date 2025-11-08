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
import { extractJSON } from './json-extractor';
import type { Widget, WidgetResponse, PlanResult, DataResult } from './widget-schema';
import { agentLogger } from './agent-logger';

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
    agentLogger.info(describePlan(plan), {
      step: 'planning',
      details: plan
    });
    
    // Validate plan
    const planValidation = validatePlanSchema(plan);
    if (!planValidation.valid) {
      throw new Error(`Invalid plan: ${planValidation.errors.join(', ')}`);
    }
    
    // Stream plan to frontend for progressive skeleton
    onUpdate({ type: 'plan', plan: planValidation.plan });
    
    // PHASE 2: Data Fetching/Generation (if needed)
    let dataResult: DataResult | null = null;

    if (plan.dataSource === 'web-search') {
      agentLogger.info(describeWebSearch(plan), {
        step: 'data',
        details: { searchQuery: plan.searchQuery, widgetType: plan.widgetType }
      });
      onUpdate({
        type: 'progress',
        phase: 'searching',
        message: 'Fetching data',
        progress: 40
      });

      dataResult = await fetchData(plan, userMessage, modelToUse);
    } else {
      agentLogger.info(describeMockDataPath(plan), {
        step: 'data',
        details: { widgetType: plan.widgetType, dataStructure: plan.dataStructure }
      });
      onUpdate({
        type: 'progress',
        phase: 'preparing',
        message: 'Generating data',
        progress: 40
      });

      dataResult = await generateMockData(plan, userMessage, modelToUse);
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
      message: 'Generating UI',
      progress: 70
    });
    
    const widget = await generateWidget(plan, dataResult, userMessage, modelToUse);
    agentLogger.info(describeWidget(widget, plan), {
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
    
  } catch (error) {
    agentLogger.error('Agent orchestration error', {
      step: 'orchestration',
      details: error
    });
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
      agentLogger.info('Web search started', { step: 'data' });
    }
  });
  
  if (!result.success) {
    agentLogger.warn('Data fetching failed; using fallback', {
      step: 'data',
      details: result.error
    });
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
    agentLogger.warn('Mock data generation failed; using empty fallback', {
      step: 'data',
      details: result.error
    });
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

// extractJSON is now imported from json-extractor.ts

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

