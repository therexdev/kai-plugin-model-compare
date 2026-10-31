"use strict";
const $=id=>document.getElementById(id);
let pickable=[];
window.fetch=window.KaiLegacyFetch("compare");
function sseEvent(frame) {
  const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n").trim();
  if (!data) return null;
  if (data === "[DONE]") return { done: true };
  let event;
  try { event = JSON.parse(data); } catch (error) { if (error.name === "SyntaxError") return null; throw error; }
  if (event.error) throw Error(event.error.message || String(event.error));
  return { content: event.choices?.[0]?.delta?.content || "", model: event.model || null, served: event.servedModel || null, warning: event.warning };
}
async function* sseDeltas(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = /\r?\n\r?\n/.exec(buffer))) {
      const event = sseEvent(buffer.slice(0, end.index));
      buffer = buffer.slice(end.index + end[0].length);
      if (event?.done) return;
      if (event) yield event;
    }
    if (buffer.length > 2 * 1024 * 1024) throw Error("The model returned an oversized response frame.");
  }
  // Some engines close directly after the final JSON frame without adding
  // another blank line. Preserve its last token and surface its errors.
  buffer += decoder.decode();
  const event = sseEvent(buffer);
  if (event && !event.done) yield event;
}
