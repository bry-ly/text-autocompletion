// Trie (Prefix Tree) - used for fast prefix-based word lookup

import { words } from "./words";

// Each node stores child characters and a weight (0 = not a word)
interface TrieNode {
  children: Map<string, TrieNode>;
  weight: number;
}

// Create an empty node
function createNode(): TrieNode {
  return { children: new Map(), weight: 0 };
}

const root = createNode();

// Insert all words into the Trie
for (const [word, weight] of words) {
  let node = root;
  for (const ch of word) {
    if (!node.children.has(ch)) node.children.set(ch, createNode());
    node = node.children.get(ch)!;
  }
  node.weight = weight;
}

// Returns matching suggestions for a given prefix, sorted by frequency
export function getSuggestions(prefix: string, limit = 8): string[] {
  const lower = prefix.toLowerCase();
  let node = root;

  for (const ch of lower) {
    if (!node.children.has(ch)) return [];
    node = node.children.get(ch)!;
  }

  const results: [string, number][] = [];
  collect(node, lower, results);
  results.sort((a, b) => b[1] - a[1]);
  return results.slice(0, limit).map(([w]) => w);
}

// Recursively collects all words below a node
function collect(node: TrieNode, prefix: string, results: [string, number][]) {
  if (node.weight > 0) results.push([prefix, node.weight]);
  for (const [ch, child] of node.children) {
    collect(child, prefix + ch, results);
  }
}
