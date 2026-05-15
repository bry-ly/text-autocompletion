// Main page - Inline autocomplete: tap ghost text on mobile, Tab on desktop

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ModeToggle } from "./_components/theme-toggle";

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch top suggestion from API with debounce
  const fetchSuggestion = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value) { setSuggestion(""); return; }
    timerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(value)}`);
      const results: string[] = await res.json();
      const match = results.find(w => w.length > value.length);
      setSuggestion(match ?? "");
    }, 100);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Tab to accept on desktop
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      acceptSuggestion();
    }
  }

  // Accept the current suggestion
  function acceptSuggestion() {
    setQuery(suggestion);
    setSuggestion("");
    inputRef.current?.focus();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 relative">
      {/* Theme toggle - top right */}
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center text-zinc-900 dark:text-zinc-100">
          Text Autocomplete
        </h1>
        {/* Input with inline ghost suggestion */}
        <div className="relative">
          {/* Ghost text - tappable on mobile, visual-only on desktop */}
          {suggestion && (
            <div
              onClick={acceptSuggestion}
              className="absolute inset-0 px-4 py-3 whitespace-pre text-zinc-400 dark:text-zinc-600 sm:pointer-events-none cursor-pointer sm:cursor-default"
            >
              <span className="invisible">{query}</span>{suggestion.slice(query.length)}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); fetchSuggestion(e.target.value); }}
            onKeyDown={handleKey}
            placeholder="Start typing..."
            className="relative w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search input"
            autoComplete="off"
          />
        </div>
        {/* Hint text adapts to screen size */}
        <p className="mt-3 text-xs text-zinc-400 text-center">
          <span className="sm:hidden">Tap the suggestion to autocomplete</span>
          <span className="hidden sm:inline">Press Tab to autocomplete</span>
        </p>
      </div>
    </div>
  );
}
