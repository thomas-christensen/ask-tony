/**
 * Shared JSON extraction utilities for parsing LLM responses
 * Handles markdown code blocks, explanatory text, and duplicate JSON
 */

/**
 * Extract JSON from LLM response with robust stack-based parsing
 * Stops at the first valid JSON object to avoid parsing duplicates
 */
export function extractJSON(text: string): any {
  try {
    // Remove markdown code blocks if present
    let cleanedText = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();

    // Find first complete JSON object using stack-based approach
    let depth = 0;
    let startIndex = -1;

    for (let i = 0; i < cleanedText.length; i++) {
      if (cleanedText[i] === '{') {
        if (depth === 0) startIndex = i;
        depth++;
      } else if (cleanedText[i] === '}') {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          // Found a complete JSON object
          const jsonStr = cleanedText.substring(startIndex, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (parseError) {
            // This wasn't valid JSON, continue searching
            startIndex = -1;
            continue;
          }
        }
      }
    }

    // Fallback: try the whole text
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Failed to extract JSON:', error);
    console.error('Text (first 500 chars):', text.slice(0, 500));
    throw new Error('Failed to parse JSON response from LLM');
  }
}

/**
 * Extract JSON with aggressive repair strategies for malformed JSON
 * Use this when dealing with potentially truncated or incomplete responses
 */
export function extractJSONWithRepair(text: string, repairFn: (json: string) => string): any {
  try {
    // Remove markdown code blocks if present
    let cleanedText = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();

    // Find first complete JSON object using stack-based approach
    let depth = 0;
    let startIndex = -1;

    for (let i = 0; i < cleanedText.length; i++) {
      if (cleanedText[i] === '{') {
        if (depth === 0) startIndex = i;
        depth++;
      } else if (cleanedText[i] === '}') {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          // Found a complete JSON object
          let jsonStr = cleanedText.substring(startIndex, i + 1);

          // Apply repair strategies
          jsonStr = repairFn(jsonStr);

          try {
            return JSON.parse(jsonStr);
          } catch (parseError) {
            // This wasn't valid JSON even after repair, continue searching
            startIndex = -1;
            continue;
          }
        }
      }
    }

    // Fallback: No valid JSON found
    throw new Error('No valid JSON object found in response');
  } catch (error) {
    console.error('❌ JSON extraction failed:', error);
    console.error('📄 Text (first 1000 chars):', text.slice(0, 1000));
    console.error('📄 Text (last 500 chars):', text.slice(-500));
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
