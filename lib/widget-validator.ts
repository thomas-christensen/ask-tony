import { z } from 'zod';
import type { Widget, PlanResult, DataResult } from './widget-schema';

/**
 * Zod schemas for validating widget JSON structures
 */

const InteractionSchema = z.object({
  type: z.enum(['hover', 'click', 'slider', 'toggle', 'filter', 'sort']),
  target: z.string().optional(),
  effect: z.string()
});

const BaseWidgetSchema = z.object({
  type: z.enum([
    'metric-card',
    'metric-grid',
    'list',
    'comparison',
    'chart',
    'timeline',
    'form',
    'gallery',
    'profile',
    'container',
    'quote',
    'recipe',
    'weather',
    'stock-ticker'
  ]),
  config: z.record(z.any()).optional(),
  data: z.any().optional(),
  interactions: z.array(InteractionSchema).optional()
});

// Recursive schema for nested widgets
const WidgetSchema: z.ZodType<Widget> = BaseWidgetSchema.extend({
  children: z.lazy(() => z.array(WidgetSchema)).optional()
});

export const PlanResultSchema = z.object({
  widgetType: z.enum([
    'metric-card',
    'metric-grid',
    'list',
    'comparison',
    'chart',
    'timeline',
    'form',
    'gallery',
    'profile',
    'container',
    'quote',
    'recipe',
    'weather',
    'stock-ticker'
  ]),
  dataSource: z.enum(['mock-database', 'web-search', 'example-data']),
  searchQuery: z.string().nullable().optional(),
  queryIntent: z.string().nullable().optional(),
  dataStructure: z.enum(['single-value', 'list', 'comparison', 'timeseries', 'grid']),
  keyEntities: z.array(z.string()),
  reasoning: z.string().optional()
});

export const DataResultSchema = z.object({
  data: z.any().default(null),
  source: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low'])
});

/**
 * Validates a widget JSON structure
 */
export function validateWidgetSchema(widget: unknown): { 
  valid: boolean; 
  errors: string[];
  widget?: Widget;
} {
  try {
    const parsed = WidgetSchema.parse(widget);
    return { valid: true, errors: [], widget: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      valid: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Validates a plan result JSON structure
 */
export function validatePlanSchema(plan: unknown): {
  valid: boolean;
  errors: string[];
  plan?: PlanResult;
} {
  try {
    const parsed = PlanResultSchema.parse(plan);
    return { valid: true, errors: [], plan: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      valid: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Validates a data result JSON structure
 */
export function validateDataSchema(data: unknown): {
  valid: boolean;
  errors: string[];
  data?: DataResult;
} {
  try {
    const parsed = DataResultSchema.parse(data) as DataResult;
    return { valid: true, errors: [], data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      valid: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Type guard to check if a widget has children (is a container)
 */
export function isContainerWidget(widget: Widget): widget is Widget & { children: Widget[] } {
  return widget.type === 'container' && Array.isArray(widget.children);
}

/**
 * Validates widget data matches expected structure for widget type
 */
export function validateWidgetData(widget: Widget): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (widget.type) {
    case 'metric-card':
      if (!widget.data?.label || widget.data?.value === undefined) {
        errors.push('metric-card requires data.label and data.value');
      }
      break;
    
    case 'metric-grid':
      if (!Array.isArray(widget.data?.metrics)) {
        errors.push('metric-grid requires data.metrics array');
      }
      break;
    
    case 'list':
      if (!Array.isArray(widget.data?.items)) {
        errors.push('list requires data.items array');
      }
      break;
    
    case 'comparison':
      if (!Array.isArray(widget.data?.options)) {
        errors.push('comparison requires data.options array');
      }
      break;
    
    case 'chart':
      if (!widget.config?.chartType) {
        errors.push('chart requires config.chartType');
      }
      if (!widget.data?.points && !widget.data?.datasets) {
        errors.push('chart requires data.points or data.datasets');
      }
      break;
    
    case 'timeline':
      if (!Array.isArray(widget.data?.events)) {
        errors.push('timeline requires data.events array');
      }
      break;
    
    case 'form':
      if (!Array.isArray(widget.data?.fields)) {
        errors.push('form requires data.fields array');
      }
      break;
    
    case 'gallery':
      if (!Array.isArray(widget.data?.items)) {
        errors.push('gallery requires data.items array');
      }
      break;
    
    case 'profile':
      if (!widget.data?.name) {
        errors.push('profile requires data.name');
      }
      break;
    
    case 'container':
      if (!widget.config?.variant) {
        errors.push('container requires config.variant');
      }
      if (!Array.isArray(widget.children) || widget.children.length === 0) {
        errors.push('container requires children array');
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}

