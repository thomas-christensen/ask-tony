/**
 * Mock Database Query Module
 *
 * Simulates database queries using JSON data and LLM-based data extraction.
 * This allows testing of intelligent data source selection without a real database.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { cursor } from './cursor-agent';
import { extractJSON } from './json-extractor';
import type { DataResult, PlanResult } from './widget-schema';

/**
 * Load the mock database JSON file
 */
function loadMockDatabase(): any {
  try {
    const dbPath = join(process.cwd(), 'data', 'mock-database.json');
    const dbContent = readFileSync(dbPath, 'utf-8');
    return JSON.parse(dbContent);
  } catch (error) {
    console.error('Failed to load mock database:', error);
    return { users: [], subscriptions: [], feature_usage: [] };
  }
}

/**
 * System prompt for extracting data from the mock database
 */
const MOCK_DATABASE_QUERY_PROMPT = `You are a Data Query Engine. Extract the requested data from the provided database JSON.

Your task:
1. Read the query intent describing what data to extract
2. Filter, aggregate, calculate, or transform the data as needed
3. Return structured data matching the requested format

Guidelines:
- Perform calculations accurately (SUM, COUNT, AVG, GROUP BY, etc.)
- Filter data based on conditions (status='active', plan='enterprise', etc.)
- For time-series: Use mrr_snapshots table for MRR over time (already pre-aggregated by month)
- For time-series: group by date/month and return chronological points
- For aggregations: return summary values or grouped counts
- For single metrics: return the calculated value with context
- Keep data concise and relevant to the widget type

Output format:
{
  "data": { /* structured data matching widget requirements */ },
  "source": "mock-database",
  "confidence": "high"
}

Examples:

Query Intent: "Sum mrr from all active subscriptions"
Output: {
  "data": { "label": "Total MRR", "value": 2943, "unit": "$" },
  "source": "mock-database",
  "confidence": "high"
}

Query Intent: "Count users grouped by plan_type where status is active"
Output: {
  "data": {
    "points": [
      { "label": "Free", "value": 4 },
      { "label": "Pro", "value": 10 },
      { "label": "Enterprise", "value": 5 }
    ]
  },
  "source": "mock-database",
  "confidence": "high"
}

Query Intent: "Count new users per month from created_at"
Output: {
  "data": {
    "points": [
      { "label": "Jan", "value": 1 },
      { "label": "Feb", "value": 1 },
      { "label": "Mar", "value": 2 },
      { "label": "Apr", "value": 2 },
      { "label": "May", "value": 2 }
    ]
  },
  "source": "mock-database",
  "confidence": "high"
}

Query Intent: "Sum usage_count grouped by feature_name from feature_usage"
Output: {
  "data": {
    "points": [
      { "label": "API Calls", "value": 45820 },
      { "label": "Dashboard Views", "value": 1234 }
    ]
  },
  "source": "mock-database",
  "confidence": "high"
}

Query Intent: "Get MRR over time from mrr_snapshots"
Output: {
  "data": {
    "points": [
      { "label": "Jan", "value": 49 },
      { "label": "Feb", "value": 348 },
      { "label": "Mar", "value": 397 },
      { "label": "Apr", "value": 745 },
      { "label": "May", "value": 1044 }
    ]
  },
  "source": "mock-database",
  "confidence": "high"
}

Return ONLY valid JSON. No markdown, no explanations.`;

/**
 * Query the mock database using LLM-based extraction
 *
 * This function:
 * 1. Loads the mock database JSON
 * 2. Uses the LLM to extract/calculate the requested data based on queryIntent
 * 3. Returns structured data in DataResult format
 */
export async function queryMockDatabase(
  plan: PlanResult,
  userMessage: string,
  model: string
): Promise<DataResult> {
  try {
    const database = loadMockDatabase();

    // Prepare the database summary (lightweight version for token efficiency)
    const dbSummary = {
      users: {
        count: database.users.length,
        sample: database.users.slice(0, 3),
        all: database.users
      },
      subscriptions: {
        count: database.subscriptions.length,
        sample: database.subscriptions.slice(0, 3),
        all: database.subscriptions
      },
      mrr_snapshots: {
        count: database.mrr_snapshots?.length || 0,
        sample: database.mrr_snapshots?.slice(0, 3) || [],
        all: database.mrr_snapshots || []
      },
      feature_usage: {
        count: database.feature_usage.length,
        sample: database.feature_usage.slice(0, 5),
        all: database.feature_usage
      }
    };

    console.log('🔍 Querying mock database with intent:', plan.queryIntent);
    console.log('📊 Database stats:', {
      users: database.users.length,
      subscriptions: database.subscriptions.length,
      mrr_snapshots: database.mrr_snapshots?.length || 0,
      feature_usage: database.feature_usage.length
    });

    const result = await cursor.generateStream({
      prompt: `Query Intent: "${plan.queryIntent}"
User Question: "${userMessage}"
Widget Type: ${plan.widgetType}
Data Structure: ${plan.dataStructure}

Database Content:
${JSON.stringify(dbSummary, null, 2)}

Extract the data according to the query intent and return it in the format suitable for a ${plan.widgetType} widget.`,
      systemPrompt: MOCK_DATABASE_QUERY_PROMPT,
      model,
      force: true
    });

    if (!result.success) {
      throw new Error('LLM query failed: ' + (result.error || 'Unknown error'));
    }

    // Parse the LLM response
    const extractedData = extractJSON(result.finalText);

    console.log('✅ Mock database query successful');
    console.log('📦 Extracted data:', JSON.stringify(extractedData, null, 2));

    return {
      data: extractedData.data || {},
      source: 'mock-database',
      confidence: 'high'
    };
  } catch (error) {
    console.error('❌ Mock database query failed:', error);
    return {
      data: {},
      source: null,
      confidence: 'low'
    };
  }
}

// extractJSON is now imported from json-extractor.ts
