(function (root, factory) { const api = factory(); if (typeof module === "object" && module.exports) module.exports = api; else root.CompareLogic = api; })(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_HISTORY_BYTES = 650000, MAX_ENTRIES = 12;
  function readyModels(value) { return Array.isArray(value) ? value.filter(m => m && m.status === "ready" && typeof m.alias === "string" && m.alias).map(m => ({ alias: m.alias, label: typeof m.label === "string" ? m.label : m.alias })) : []; }
  function validateRequest(prompt, a, b, tokens, models) { if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 16000) throw Error("Enter a prompt from 1 to 16,000 characters."); if (![512, 1024, 2048, 4096].includes(tokens)) throw Error("Choose a valid reply limit."); if (![a, b].every(alias => models.some(m => m.alias === alias))) throw Error("Choose two available local models."); return { prompt: prompt.trim(), a, b, maxTokens: tokens }; }
  function history(value) { if (value == null) return []; if (!Array.isArray(value) || value.length > MAX_ENTRIES || value.some(item => !item || typeof item.id !== "string" || typeof item.prompt !== "string" || !Array.isArray(item.results) || item.results.length !== 2 || item.results.some(r => !r || typeof r.model !== "string" || !["done", "error", "skipped"].includes(r.status) || typeof r.text !== "string"))) throw Error("Saved comparisons could not be read. Their stored data was not replaced."); return value; }
  function addHistory(current, item) {
    const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
    if (bytes([item]) > MAX_HISTORY_BYTES) return { entries: current, saved: false, removed: 0 };
    const entries = [item, ...current.filter(old => old.id !== item.id)]; let removed = 0;
    while (entries.length > MAX_ENTRIES || bytes(entries) > MAX_HISTORY_BYTES) { entries.pop(); removed++; }
    return { entries, saved: true, removed };
  }
  function summarize(result) { if (result.status === "done") return `${(Math.max(0, result.elapsedMs) / 1000).toFixed(1)}s · ${result.text.trim().split(/\s+/u).filter(Boolean).length} words`; return result.status === "error" ? "Request failed" : result.status === "skipped" ? "Stopped before this model ran" : result.status === "running" ? "Generating on your device…" : "Waiting for the first model"; }
  return { readyModels, validateRequest, history, addHistory, summarize, MAX_ENTRIES };
});
