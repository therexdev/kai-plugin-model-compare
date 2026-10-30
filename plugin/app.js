"use strict";
const $=id=>document.getElementById(id);
let pickable=[];
window.fetch=window.KaiLegacyFetch("compare");
async function* sseDeltas(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const j = JSON.parse(data);
          yield { content: j.choices?.[0]?.delta?.content || "", model: j.model || null, served: j.servedModel || null, warning: j.warning };
        } catch {
          /* keep-alive or non-JSON frame */
        }
      }
    }
  }
}

