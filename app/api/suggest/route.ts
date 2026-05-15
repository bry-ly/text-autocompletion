// API route for autocomplete suggestions

import { NextRequest, NextResponse } from "next/server";
import { getSuggestions } from "@/lib/trie";

// Handles GET /api/suggest?q=<prefix> and returns matching words as JSON
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json([]);
  return NextResponse.json(getSuggestions(q));
}
