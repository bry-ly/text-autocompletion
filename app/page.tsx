"use client";

import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from "react";
import { ModeToggle } from "./_components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { ShimmerButton } from "shimmer-effects-react";

// localStorage keys
const HISTORY_KEY = "autocomplete-history";
const FREQ_KEY = "autocomplete-freq";

// Read search history from localStorage
function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
}

// Save a word to search history (most recent first, max 10)
function saveHistory(word: string) {
  const h = getHistory().filter((w) => w !== word);
  h.unshift(word);
  const json = JSON.stringify(h.slice(0, 10));
  localStorage.setItem(HISTORY_KEY, json);
  cachedHistoryRaw = json;
  cachedHistory = h.slice(0, 10);
}

// Increment frequency counter for a word (used to rank suggestions)
function bumpFrequency(word: string) {
  const freq = JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
  freq[word] = (freq[word] || 0) + 1;
  localStorage.setItem(FREQ_KEY, JSON.stringify(freq));
}

// Clear all search history
function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
  cachedHistoryRaw = null;
  cachedHistory = EMPTY_HISTORY;
  window.dispatchEvent(new Event("storage"));
}

// Cached snapshot for useSyncExternalStore (avoids infinite re-renders)
const EMPTY_HISTORY: string[] = [];
let cachedHistory: string[] = EMPTY_HISTORY;
let cachedHistoryRaw: string | null = null;

// Returns cached history array, only re-parses when localStorage changes
function getHistorySnapshot(): string[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw !== cachedHistoryRaw) {
    cachedHistoryRaw = raw;
    cachedHistory = raw ? JSON.parse(raw) : EMPTY_HISTORY;
  }
  return cachedHistory;
}

// Animates text changes in place using the t-text-swap transition
function SwapText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);
  useEffect(() => {
    const el = ref.current;
    if (!el || text === prev.current) return;
    const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-swap-dur")) || 150;
    el.classList.add("is-exit");
    const t = setTimeout(() => {
      prev.current = text;
      el.classList.remove("is-exit");
      el.classList.add("is-enter-start");
      void el.offsetHeight;
      el.classList.remove("is-enter-start");
    }, dur);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <span ref={ref} className={`t-text-swap${className ? ` ${className}` : ""}`}>
      {text}
    </span>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1); // keyboard-selected badge index

  // Subscribe to history via useSyncExternalStore (SSR-safe, no useEffect setState)
  const history = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    getHistorySnapshot,
    () => EMPTY_HISTORY,
  );

  const abortRef = useRef<AbortController | null>(null); // cancel stale fetches
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce timer
  const inputRef = useRef<HTMLInputElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const prevGhostText = useRef(""); // track previous ghost text to drive swap
  const [, forceUpdate] = useState(0); // trigger re-render after history update

  // First suggestion that is an exact prefix match (used for inline ghost text)
  const inlineSuggestion = suggestions.find((w) => w.toLowerCase().startsWith(query.toLowerCase()) && w.length > query.length) ?? "";

  // Fetch suggestions with debounce + AbortController
  const fetchSuggestions = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort(); // cancel previous request
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const results: string[] = await res.json();
        // Sort by user's pick frequency (learned from localStorage)
        const freq = JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
        const filtered = results.filter((w) => w.length > value.length);
        filtered.sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
        setSuggestions(filtered);
      } catch {
        /* request aborted, ignore */
      }
      setLoading(false);
      setActiveIdx(-1);
    }, 100);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Animate ghost text swap when inlineSuggestion changes
  useEffect(() => {
    const el = ghostRef.current;
    const next = inlineSuggestion.slice(query.length);
    if (!el || next === prevGhostText.current) return;
    const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-swap-dur")) || 150;
    el.classList.add("is-exit");
    const t = setTimeout(() => {
      prevGhostText.current = next;
      el.classList.remove("is-exit");
      el.classList.add("is-enter-start");
      void el.offsetHeight;
      el.classList.remove("is-enter-start");
    }, dur);
    return () => clearTimeout(t);
  }, [inlineSuggestion, query]);

  // Keyboard handler: Tab accepts inline, Arrow keys navigate badges, Enter selects
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Tab" && inlineSuggestion) {
      e.preventDefault();
      accept(inlineSuggestion);
    } else if (e.key === "ArrowRight" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowLeft" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      accept(suggestions[activeIdx]);
    }
  }

  // Accept a suggestion: update query, save to history, bump frequency
  function accept(word: string) {
    setQuery(word);
    setSuggestions([]);
    setActiveIdx(-1);
    saveHistory(word);
    bumpFrequency(word);
    forceUpdate((n) => n + 1); // re-render to reflect updated history
    inputRef.current?.focus();
  }

  const showHistory = !query && history.length > 0;
  const activeId = activeIdx >= 0 ? `suggestion-${activeIdx}` : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4 relative overflow-hidden">
      <div className="absolute top-4 left-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Text Autocompletion</div>
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-lg z-10">
        {/* Input Container - Minimal Design */}
        <div className="relative bg-white dark:bg-zinc-900 rounded-xl border border-zinc-300 dark:border-zinc-800 shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
          {inlineSuggestion && (
            <div className="absolute inset-0 px-4 py-4 whitespace-pre text-zinc-500 dark:text-zinc-600 pointer-events-none text-lg font-normal">
              <span className="invisible">{query}</span>
              <span className="pointer-events-none t-text-swap" ref={ghostRef}>
                {inlineSuggestion.slice(query.length)}
              </span>
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              fetchSuggestions(e.target.value);
            }}
            onKeyDown={handleKey}
            placeholder="Start typing..."
            className="relative w-full px-4 py-4 rounded-xl bg-transparent text-zinc-900 dark:text-zinc-100 text-lg placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none transition-all"
            aria-label="Search input"
            aria-activedescendant={activeId}
            aria-controls="suggestions-list"
            aria-expanded={suggestions.length > 0}
            autoComplete="off"
            role="combobox"
          />
        </div>

        {/* Shimmer loading placeholder while fetching */}
        {loading && suggestions.length === 0 && (
          <div className="mt-2 flex gap-2">
            {[1, 2, 3].map((i) => (
              <ShimmerButton key={i} size="sm" mode="light" />
            ))}
          </div>
        )}

        {/* Clickable badge suggestions with edge fades */}
        {suggestions.length > 0 && (
          <div className="relative mt-4">
            <div id="suggestions-list" role="listbox" className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
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
                  {/* Prefix highlight: bold the typed portion */}
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{word.slice(0, query.length)}</span><SwapText text={word.slice(query.length)} className="text-zinc-600 dark:text-zinc-400" />
                </Badge>
              ))}
            </div>
            {/* Edge fades */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-zinc-100 dark:from-zinc-950 to-transparent pointer-events-none z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-zinc-100 dark:from-zinc-950 to-transparent pointer-events-none z-10" />
          </div>
        )}

        {/* Recent search history (shown when input is empty) */}
        {showHistory && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
              <span className="text-xs text-zinc-500 shrink-0 self-center">Recent:</span>
              {history.map((word) => (
                <Badge
                  key={word}
                  variant="outline"
                  onClick={() => {
                    setQuery(word);
                    fetchSuggestions(word);
                  }}
                  className="cursor-pointer shrink-0 text-xs px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {word}
                </Badge>
              ))}
            </div>
            <button onClick={clearHistory} className="ml-4 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors underline underline-offset-2">
              Clear
            </button>
          </div>
        )}

        {/* Hint text: adapts to screen size */}
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 text-center">
          <span className="sm:hidden">Tap a suggestion or tap input to accept inline hint</span>
          <span className="hidden sm:inline">Tab to accept · Arrow keys to navigate · Enter to select</span>
        </p>
      </div>
    </div>
  );
}
