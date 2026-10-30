"use strict";
(() => {
  const $ = id => document.getElementById(id), call = (method, input) => window.kai.call(method, input), logic = window.CompareLogic;
  const state = { models: [], history: [], current: null, busy: false, running: false, stop: false, storageReady: true, pendingDelete: null, unsaved: false };
  const banner = window.KaiPluginNotice.attach($("notice"), { focusTarget: () => $("prompt") });
  function notice(message, error = false) { banner.show(message || "", { error, force: true }); }
  function controls() {
    for (const id of ["prompt", "model-a", "model-b", "tokens", "refresh"]) $(id).disabled = state.busy;
    $("compare").disabled = state.busy || state.unsaved || !$("model-a").value || !$("model-b").value;
    $("stop").hidden = !state.running; $("stop").disabled = state.stop;
    $("reveal").disabled = state.busy;
    for (const button of document.querySelectorAll("[data-pick]")) button.disabled = state.busy || state.unsaved;
    $("save-again").hidden = !state.unsaved || !state.storageReady; $("save-again").disabled = state.busy;
    for (const button of document.querySelectorAll(".history button,[data-prompt]")) button.disabled = state.busy || state.unsaved;
  }
  function renderResults() {
    const item = state.current; $("results").hidden = !item; if (!item) return;
    for (let index = 0; index < 2; index++) {
      const side = index === 0 ? "a" : "b", result = item.results[index]; $("name-" + side).textContent = item.revealed === false ? `Answer ${index + 1}` : `Answer ${index + 1} — ${result.label || result.model}`; $("meta-" + side).textContent = logic.summarize(result);
      $("state-" + side).textContent = { done: "COMPLETE", error: "FAILED", skipped: "STOPPED", running: "THINKING", queued: "QUEUED" }[result.status];
      $("result-" + side).classList.toggle("failed", result.status === "error"); $("result-" + side).classList.toggle("running", result.status === "running");
      $("text-" + side).textContent = result.text || (result.status === "running" ? "Your local model is working on the prompt…" : result.status === "queued" ? "This model will run after the first response finishes." : "This model was not run.");
    }
    const settled = item.results.every(result => ["done", "error", "skipped"].includes(result.status));
    $("verdict").hidden = !settled;
    $("reveal").hidden = item.revealed !== false;
    $("vote").hidden = item.revealed === false || !item.results.every(result => result.status === "done") || ["0", "1", "tie"].includes(item.pick);
    $("verdict-note").textContent = item.pick === "tie" ? "Your pick: Tie" : ["0", "1"].includes(item.pick) ? `Your pick: Answer ${Number(item.pick) + 1}` : "";
  }
  function renderHistory() {
    $("history").replaceChildren(); $("history-count").textContent = `${state.history.length} / ${logic.MAX_ENTRIES} saved`;
    for (const item of state.history) {
      const row = document.createElement("div"); row.className = "history-row";
      const open = document.createElement("button"); open.className = "history-open"; const title = document.createElement("strong"); title.textContent = item.prompt;
      const meta = document.createElement("span"); const date = new Date(item.createdAt); meta.textContent = `${item.revealed === false ? "Models hidden · Reveal after reviewing" : item.results.map(r => r.label || r.model).join("  /  ")}${Number.isNaN(date.getTime()) ? "" : " · " + date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      open.append(title, meta); open.addEventListener("click", () => { if (state.busy || state.unsaved) return; state.current = item; $("prompt").value = item.prompt; for (const [index, side] of [[0, "a"], [1, "b"]]) { const model = Array.isArray(item.selectedModels) ? item.selectedModels[index] : item.revealed === false ? null : item.results[index].model; if (state.models.some(m => m.alias === model)) $("model-" + side).value = model; } if ([512, 1024, 2048, 4096].includes(item.maxTokens)) $("tokens").value = item.maxTokens; $("save-status").textContent = "Saved on this device"; notice(""); renderResults(); $("results").scrollIntoView({ behavior: "smooth", block: "start" }); });
      const remove = document.createElement("button"); remove.className = "delete-row"; remove.textContent = "Delete"; remove.setAttribute("aria-label", "Delete comparison: " + item.prompt.slice(0, 60)); remove.addEventListener("click", () => { if (state.busy || state.unsaved) return; state.pendingDelete = item.id; $("delete-dialog").showModal(); });
      row.append(open, remove); $("history").append(row);
    }
    if (!state.history.length) { const empty = document.createElement("p"); empty.className = "empty-history"; empty.textContent = "Your completed comparisons will appear here, saved on this device."; $("history").append(empty); } controls();
  }
  async function loadModels() {
    const previous = [$("model-a").value, $("model-b").value]; state.models = logic.readyModels(await call("models.list", {})); $("model-count").textContent = state.models.length;
    for (const [index, side] of [[0, "a"], [1, "b"]]) {
      const select = $("model-" + side); select.replaceChildren();
      for (const model of state.models) { const option = document.createElement("option"); option.value = model.alias; option.textContent = model.label; select.append(option); }
      if (!state.models.length) { const option = document.createElement("option"); option.value = ""; option.textContent = "No installed local model"; select.append(option); }
      else select.value = state.models.some(m => m.alias === previous[index]) ? previous[index] : state.models[Math.min(index, state.models.length - 1)].alias;
    }
    if (!state.models.length) notice("Install a local model in Core → Models, then refresh. Model Compare uses installed models only.");
    else if (state.models.length === 1) notice("One model is available. You can compare two independent replies from it, or install a second model in Core."); controls();
  }
  async function saveCurrent() {
    if (!state.storageReady) { $("save-status").textContent = "Not saved: existing history needs attention"; return; }
    const next = logic.addHistory(state.history, state.current);
    if (!next.saved) { $("save-status").textContent = "Response too large to save; select and copy the text to keep it."; state.unsaved = false; return; }
    try { await call("storage.set", { key: "history", value: next.entries }); state.history = next.entries; state.unsaved = false; $("save-status").textContent = next.removed ? `Saved · ${next.removed} oldest comparison(s) removed to fit storage` : "Saved on this device"; renderHistory(); }
    catch (error) { state.unsaved = true; $("save-status").textContent = "Not saved yet"; controls(); throw error; }
  }
  async function run(event) {
    event.preventDefault(); if (state.busy || state.unsaved) return;
    let request; try { request = logic.validateRequest($("prompt").value, $("model-a").value, $("model-b").value, Number($("tokens").value), state.models); } catch (error) { notice(error.message, true); return; }
    state.busy = true; state.running = true; state.stop = false; notice(""); $("save-status").textContent = "";
    const orderedModels = crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? [request.b, request.a] : [request.a, request.b];
    state.current = { revealed: false, selectedModels: [request.a, request.b], id: `cmp-${Date.now().toString(36)}-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), prompt: request.prompt, maxTokens: request.maxTokens, results: orderedModels.map(model => ({ model, label: state.models.find(m => m.alias === model).label, status: "queued", text: "", elapsedMs: 0 })) };
    controls(); renderResults(); $("results").scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      for (let i = 0; i < 2; i++) {
        const result = state.current.results[i];
        if (state.stop) { result.status = "skipped"; renderResults(); continue; }
        result.status = "running"; $("run-status").textContent = `Running model ${i + 1} of 2…`; renderResults(); const started = performance.now();
        try { const response = await call("inference.local", { model: result.model, prompt: request.prompt, maxTokens: request.maxTokens }); if (typeof response?.text !== "string" || !response.text.trim()) throw Error("The model returned an empty response."); result.text = response.text; result.status = "done"; }
        catch (error) { result.text = error.message || String(error); result.status = "error"; }
        result.elapsedMs = performance.now() - started; renderResults();
      }
      $("run-status").textContent = state.stop ? "Stopped" : "Comparison finished"; await saveCurrent();
    } catch (error) { notice(error.message || String(error), true); }
    finally { state.busy = false; state.running = false; controls(); }
  }
  async function guarded(action) { if (state.busy) return; state.busy = true; controls(); try { await action(); } catch (error) { notice(error.message || String(error), true); } finally { state.busy = false; controls(); } }
  $("comparison-form").addEventListener("submit", run); $("refresh").addEventListener("click", () => guarded(loadModels));
  $("stop").addEventListener("click", () => { state.stop = true; $("run-status").textContent = "Will stop when the current model finishes"; controls(); });
  $("save-again").addEventListener("click", () => guarded(saveCurrent));
  const closeDelete = () => { state.pendingDelete = null; $("delete-dialog").close(); };
  $("cancel-delete").addEventListener("click", closeDelete);
  $("close-delete").addEventListener("click", closeDelete);
  $("delete-dialog").addEventListener("cancel", () => { state.pendingDelete = null; });
  $("reveal").addEventListener("click", () => guarded(async () => {
    if (!state.current || state.current.results.some(result => ["queued", "running"].includes(result.status))) return;
    state.current = { ...state.current, revealed: true }; renderResults(); await saveCurrent();
  }));
  for (const button of document.querySelectorAll("[data-pick]")) button.addEventListener("click", () => guarded(async () => {
    if (!state.current || state.current.revealed === false || !state.current.results.every(result => result.status === "done") || !["0", "1", "tie"].includes(button.dataset.pick)) return;
    state.current = { ...state.current, pick: button.dataset.pick }; renderResults(); await saveCurrent();
  }));
  $("confirm-delete").addEventListener("click", () => guarded(async () => { const next = state.history.filter(item => item.id !== state.pendingDelete); await call("storage.set", { key: "history", value: next }); state.history = next; if (state.current?.id === state.pendingDelete) { state.current = null; renderResults(); } state.pendingDelete = null; $("delete-dialog").close(); renderHistory(); }));
  for (const button of document.querySelectorAll("[data-prompt]")) button.addEventListener("click", () => { $("prompt").value = button.dataset.prompt; $("prompt").focus(); });
  for (const id of ["model-a", "model-b", "tokens"]) $(id).addEventListener("change", () => guarded(() => call("storage.set", { key: "preferences", value: { a: $("model-a").value, b: $("model-b").value, maxTokens: Number($("tokens").value) } })));
  void guarded(async () => {
    if (!window.kai?.call || window.kai.apiVersion < 2) throw Error("Open this plugin in KAI Core 0.2.0 or later.");
    await loadModels();
    try { state.history = logic.history(await call("storage.get", { key: "history" })); renderHistory(); }
    catch (error) { state.storageReady = false; notice(error.message || String(error), true); }
    const prefs = await call("storage.get", { key: "preferences" });
    if (prefs) { for (const side of ["a", "b"]) if (state.models.some(m => m.alias === prefs[side])) $("model-" + side).value = prefs[side]; if ([512, 1024, 2048, 4096].includes(prefs.maxTokens)) $("tokens").value = String(prefs.maxTokens); }
  });
})();
