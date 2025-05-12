/**
 * Transforms parameter names from underscore format to hyphenated format.
 * This is needed because the MCP API accepts underscore format (typical for JS/Python),
 * but the external JPL APIs expect hyphenated format.
 * 
 * @param params Original parameters with underscore format
 * @returns Transformed parameters with hyphenated format
 */
export function transformParamsToHyphenated(params: Record<string, any>): Record<string, any> {
  const transformed: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    // Replace underscores with hyphens for parameter names
    const transformedKey = key.replace(/_/g, '-');
    transformed[transformedKey] = value;
  }
  
  return transformed;
} 