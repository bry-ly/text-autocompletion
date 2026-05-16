// Trie with prefix + fuzzy matching support

import { words } from "./words";

interface TrieNode {
  children: Map<string, TrieNode>;
  weight: number;
}

function createNode(): TrieNode {
  return { children: new Map(), weight: 0 };
}

const root = createNode();
const allWords: [string, number][] = [];

for (const [word, weight] of words) {
  allWords.push([word, weight]);
  let node = root;
  for (const ch of word) {
    if (!node.children.has(ch)) node.children.set(ch, createNode());
    node = node.children.get(ch)!;
  }
  node.weight = weight;
}

// Prefix-based suggestions
export function getSuggestions(prefix: string, limit = 8): string[] {
  const lower = prefix.toLowerCase();
  let node = root;
  for (const ch of lower) {
    if (!node.children.has(ch)) {
      // Fall back to fuzzy if no prefix match
      return getFuzzySuggestions(lower, limit);
    }
    node = node.children.get(ch)!;
  }
  const results: [string, number][] = [];
  collect(node, lower, results);
  if (results.length < limit) {
    // Supplement with fuzzy results
    const fuzzy = getFuzzySuggestions(lower, limit - results.length);
    const existing = new Set(results.map(([w]) => w));
    for (const w of fuzzy) {
      if (!existing.has(w)) results.push([w, 1]);
    }
  }
  results.sort((a, b) => b[1] - a[1]);
  return results.slice(0, limit).map(([w]) => w);
}

function collect(node: TrieNode, prefix: string, results: [string, number][]) {
  if (node.weight > 0) results.push([prefix, node.weight]);
  for (const [ch, child] of node.children) {
    collect(child, prefix + ch, results);
  }
}

// Simple fuzzy: edit distance <= 1 for short queries, <= 2 for longer
function getFuzzySuggestions(query: string, limit: number): string[] {
  const maxDist = query.length <= 3 ? 1 : 2;
  const scored: [string, number, number][] = [];
  for (const [word, weight] of allWords) {
    if (Math.abs(word.length - query.length) > maxDist) continue;
    const dist = levenshtein(query, word.slice(0, query.length + maxDist));
    if (dist <= maxDist) scored.push([word, weight, dist]);
  }
  scored.sort((a, b) => a[2] - b[2] || b[1] - a[1]);
  return scored.slice(0, limit).map(([w]) => w);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
