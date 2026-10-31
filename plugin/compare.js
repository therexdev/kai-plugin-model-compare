// ---------- compare (blind A/B, sequential — one model slot) ----------

const cmp = { running: false, abort: null, models: [null, null], revealed: false };

function cmpFillPickers() {
  for (const id of ["cmp-a", "cmp-b"]) {
    const sel = $(id);
    const prev = sel.value;
    sel.innerHTML = "";
    for (const w of pickable) {
      const o = document.createElement("option");
      o.value = w.v;
      o.textContent = w.label;
      sel.appendChild(o);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }
  // Default to comparing two DIFFERENT models when possible.
  if ($("cmp-a").value === $("cmp-b").value && pickable.length > 1) {
    $("cmp-b").selectedIndex = ($("cmp-a").selectedIndex + 1) % pickable.length;
  }
}

function renderCompare() {
  cmpFillPickers();
}

// Preset prompts: one chip per skill the bench also probes, so a blind vote
// teaches something specific. Clicking fills the box — the user still edits
// and runs; nothing fires on its own.
const CMP_PRESETS = [
  {
    label: "🧮 Logic",
    prompt:
      "A farmer has 17 sheep. All but 9 wander off. How many sheep does the farmer have left? Explain your reasoning in one sentence, then give the number alone on the final line.",
  },
  {
    label: "💻 Code",
    prompt:
      "Write a JavaScript function dedupe(arr) that removes duplicate values while keeping first-occurrence order. Show the function, then one example call and its output.",
  },
  {
    label: "📋 Instructions",
    prompt:
      "List exactly 5 unusual uses for a brick. Number them 1 to 5, each under 8 words, with no introduction and no closing sentence.",
  },
  {
    label: "📝 Summarize",
    prompt:
      "Summarize the following in exactly two sentences: Honeybees communicate the location of food through a waggle dance. The dance's angle relative to vertical encodes direction relative to the sun, while its duration encodes distance. Other bees follow the dance in the dark of the hive, reading it by touch, and then fly out to the advertised flowers. Studies show the dance also reflects the quality of the source, with livelier dances recruiting more foragers to richer nectar.",
  },
  {
    label: "✨ Creative",
    prompt:
      "Write the opening paragraph of a mystery story set in a lighthouse, at most 80 words, ending on an unresolved detail.",
  },
];
for (const p of CMP_PRESETS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "cmp-preset";
  b.textContent = p.label;
  b.title = p.prompt;
  b.addEventListener("click", () => {
    $("cmp-input").value = p.prompt;
    $("cmp-input").focus();
  });
  $("cmp-presets").appendChild(b);
}

async function cmpStreamInto(model, prompt, paneIdx, signal, maxTokens, onFirstToken) {
  const body = $(`cmp-body-${paneIdx}`);
  const resp = await fetch("/core/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({ model, stream: true, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) {
    const j = await resp.json().catch(() => null);
    throw new Error(j?.error?.message || `Core answered ${resp.status}`);
  }
  let acc = "";
  let lastPaint = 0;
  for await (const { content } of sseDeltas(resp.body)) {
    if (!content) continue;
    if (!acc) onFirstToken?.();
    acc += content;
    const now = performance.now();
    if (now - lastPaint > 80) {
      body.innerHTML = mdToHtml(acc);
      lastPaint = now;
    }
  }
  if (!acc.trim()) throw Error("This model finished without an answer. Try another model or a shorter prompt.");
  body.innerHTML = mdToHtml(acc);
  return acc;
}

$("cmp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("cmp-input").value.trim();
  if (!prompt || cmp.running) return;
  const a = $("cmp-a").value;
  const b = $("cmp-b").value;
  const maxTokens = Number($("cmp-tokens").value);
  if (!a || !b || ![512, 1024, 2048, 4096].includes(maxTokens)) {
    $("cmp-status").hidden = false;
    KaiI18n.setText($("cmp-status"), !a || !b ? "Choose two available models. Install local models from the Model library if this list is empty." : "Choose a valid reply length.");
    return;
  }
  if (a === b) {
    $("cmp-status").hidden = false;
    KaiI18n.setText($("cmp-status"), "Pick two different models to compare.");
    return;
  }
  cmp.running = true;
  cmp.revealed = false;
  cmp.abort = new AbortController();
  // Blind: coin-flip which model answers in which pane.
  cmp.models = Math.random() < 0.5 ? [a, b] : [b, a];
  $("cmp-run").disabled = true;
  for (const id of ["cmp-a", "cmp-b", "cmp-tokens"]) $(id).disabled = true;
  $("cmp-stop").hidden = false;
  $("cmp-panes").hidden = false;
  $("cmp-verdict").hidden = true;
  $("cmp-vote").hidden = true;
  $("cmp-reveal").hidden = false;
  $("cmp-tally").textContent = "";
  for (const i of [0, 1]) {
    KaiI18n.setText($(`cmp-label-${i}`), KaiI18n.message`Answer ${i + 1}`);
    $(`cmp-body-${i}`).innerHTML = "";
  }
  const status = $("cmp-status");
  status.hidden = false;
  try {
    KaiI18n.setText(status, "Preparing or waiting for the first model…");
    await cmpStreamInto(cmp.models[0], prompt, 0, cmp.abort.signal, maxTokens, () => KaiI18n.setText(status, "First model answering…"));
    cmp.abort.signal.throwIfAborted();
    KaiI18n.setText(status, "Preparing or waiting for the second model…");
    await cmpStreamInto(cmp.models[1], prompt, 1, cmp.abort.signal, maxTokens, () => KaiI18n.setText(status, "Second model answering…"));
    status.hidden = true;
    $("cmp-verdict").hidden = false;
  } catch (err) {
    KaiI18n.setText(status, err.name === "AbortError" ? "Stopped." : String(err.message));
  } finally {
    cmp.running = false;
    cmp.abort = null;
    $("cmp-run").disabled = false;
    for (const id of ["cmp-a", "cmp-b", "cmp-tokens"]) $(id).disabled = false;
    $("cmp-stop").hidden = true;
  }
});

$("cmp-stop").addEventListener("click", () => cmp.abort?.abort());

function cmpLabelOf(v) {
  return (pickable.find((w) => w.v === v)?.label || v).replace(/^Local · /, "");
}

$("cmp-reveal").addEventListener("click", () => {
  cmp.revealed = true;
  for (const i of [0, 1]) KaiI18n.setText($(`cmp-label-${i}`), KaiI18n.message`Answer ${i + 1} — ${cmpLabelOf(cmp.models[i])}`);
  $("cmp-reveal").hidden = true;
  $("cmp-vote").hidden = false;
});

// Local scoreboard: pairwise picks, kept on this machine only.
$("cmp-vote").addEventListener("click", (e) => {
  const btn = e.target.closest(".cmp-vote-btn");
  if (!btn) return;
  const pick = btn.dataset.pick;
  const winner = pick === "tie" ? "tie" : cmp.models[Number(pick)];
  let tally;
  try { tally = JSON.parse(localStorage.getItem("kai-compare-tally") || "{}"); } catch { tally = {}; }
  const key = [cmp.models[0], cmp.models[1]].sort().join(" vs ");
  tally[key] = tally[key] || {};
  tally[key][winner] = (tally[key][winner] || 0) + 1;
  localStorage.setItem("kai-compare-tally", JSON.stringify(tally));
  $("cmp-vote").hidden = true;
  const parts = Object.entries(tally[key])
    .sort((x, y) => y[1] - x[1])
    .map(([who, n]) => `${who === "tie" ? "ties" : cmpLabelOf(who)}: ${n}`);
  KaiI18n.setText($("cmp-tally"), KaiI18n.message`Your picks so far — ${parts.join(" · ")}`);
});

