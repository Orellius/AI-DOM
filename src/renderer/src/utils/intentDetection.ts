const BUILD_PATTERNS = [
  /\b(?:shall I|let me|I(?:'ll| will| can))\s+(?:build|create|implement|modify|fix|write|refactor|add|set up|configure)\b/i,
  /\b(?:ready to|going to|about to)\s+(?:build|create|implement|code|write)\b/i,
  /\bI(?:'ll| will) (?:start|begin) (?:building|creating|implementing|coding|writing)\b/i,
  /\b(?:here's|here is) (?:the|a|my) (?:plan|implementation|code|solution)\b/i,
  /\b(?:let's|we should|we could)\s+(?:build|create|implement|set up)\b/i,
]

/** Detect if an assistant message suggests build/implementation work */
export function detectBuildIntent(text: string): boolean {
  return BUILD_PATTERNS.some((pattern) => pattern.test(text))
}
