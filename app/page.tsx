"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ModeToggle } from "./_components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { ShimmerButton } from "shimmer-effects-react";

const HISTORY_KEY = "autocomplete-history";
const FREQ_KEY = "autocomplete-freq";

function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
}
function saveHistory(word: string) {
  const h = getHistory().filter(w => w !== word);
  h.unshift(word);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10)));
}
function bumpFrequency(word: string) {
  const freq = JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
  freq[word] = (freq[word] || 0) + 1;
  localStorage.setItem(FREQ_KEY, JSON.stringify(freq));
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); setHistory(getHistory()); }, []);

  const inlineSuggestion = suggestions.find(w => w.length > query.length) ?? "";

  const fetchSuggestions = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value) { setSuggestions([]); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const results: string[] = await res.json();
        // Sort by localStorage frequency
        const freq = JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
        const filtered = results.filter(w => w.length > value.length);
        filtered.sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
        setSuggestions(filtered);
      } catch { /* aborted */ }
      setLoading(false);
      setActiveIdx(-1);
    }, 100);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Tab" && inlineSuggestion) {
      e.preventDefault();
      accept(inlineSuggestion);
    } else if (e.key === "ArrowRight" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowLeft" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      accept(suggestions[activeIdx]);
    }
  }

  function accept(word: string) {
    setQuery(word);
    setSuggestions([]);
    setActiveIdx(-1);
    saveHistory(word);
    bumpFrequency(word);
    setHistory(getHistory());
    inputRef.current?.focus();
  }

  const showHistory = mounted && !query && history.length > 0;
  const activeId = activeIdx >= 0 ? `suggestion-${activeIdx}` : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 relative">
      <div className="absolute top-4 right-4"><ModeToggle /></div>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center text-zinc-900 dark:text-zinc-100">
          Text Autocomplete
        </h1>
        <div className="relative">
          {inlineSuggestion && (
            <div className="absolute inset-0 px-4 py-3 whitespace-pre text-zinc-400 dark:text-zinc-600 pointer-events-none hidden sm:block">
              <span className="invisible">{query}</span>{inlineSuggestion.slice(query.length)}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); fetchSuggestions(e.target.value); }}
            onKeyDown={handleKey}
            placeholder="Start typing..."
            className="relative w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search input"
            aria-activedescendant={activeId}
            aria-controls="suggestions-list"
            aria-expanded={suggestions.length > 0}
            autoComplete="off"
            role="combobox"
          />
        </div>

        {/* Shimmer loading */}
        {loading && suggestions.length === 0 && (
          <div className="mt-2 flex gap-2">
            {[1, 2, 3].map(i => (
              <ShimmerButton key={i} size="sm" mode="light" />
            ))}
          </div>
        )}

        {/* Badge suggestions */}
        {suggestions.length > 0 && (
          <div
            id="suggestions-list"
            role="listbox"
            className="mt-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {suggestions.map((word, idx) => (
              <Badge
                key={word}
                id={`suggestion-${idx}`}
                role="option"
                aria-selected={idx === activeIdx}
                variant={idx === activeIdx ? "default" : "secondary"}
                onClick={() => accept(word)}
                className="cursor-pointer shrink-0 text-xs px-3 py-1"
              >
                <span className="font-bold">{word.slice(0, query.length)}</span>
                {word.slice(query.length)}
              </Badge>
            ))}
          </div>
        )}

        {/* Recent history when input is empty */}
        {showHistory && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <span className="text-xs text-zinc-400 shrink-0 self-center">Recent:</span>
            {history.map(word => (
              <Badge
                key={word}
                variant="outline"
                onClick={() => { setQuery(word); fetchSuggestions(word); }}
                className="cursor-pointer shrink-0 text-xs px-3 py-1"
              >
                {word}
              </Badge>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-400 text-center">
          <span className="sm:hidden">Tap a suggestion to autocomplete</span>
          <span className="hidden sm:inline">Tab to accept · Arrow keys to navigate · Enter to select</span>
        </p>
      </div>
    </div>
  );
}
