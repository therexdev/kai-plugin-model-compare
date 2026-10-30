"use strict";
const {createTransport,forwardResponse}=require("./transport");
function create(api) {
 const transport=createTransport({signal:api.signal,async route(req,res) {
  const path=new URL(req.url,"http://plugin.invalid").pathname;
  const json=body=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(body));};
  if(req.method==="GET"&&path==="/core/models")return json({ok:true,aliases:api.models.list(),runtime:api.runtime?.status?.()||{}});
  if(req.method==="GET"&&path==="/core/network")return json(api.network.status());
  if(req.method==="GET"&&path==="/core/network-models")return json({models:api.network.status().privacyMode==="local-only"?[]:await api.network.models()});
  if(req.method!=="POST"||path!=="/core/chat/completions")throw Error("Model Compare request denied");
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const input=JSON.parse(Buffer.concat(chunks).toString()||"{}");
  const response=await api.models.request(input,transport.execution.getStore()?.signal);
  if(input.stream===true&&response.ok&&!response.headers.get("content-type")?.includes("text/event-stream")) {
   const completion=await response.json();
   res.writeHead(200,{"content-type":"text/event-stream"});
   res.write("data: "+JSON.stringify({model:completion.model||input.model,choices:[{delta:{content:completion.choices?.[0]?.message?.content||""}}]})+"\n\n");
   res.end("data: [DONE]\n\n");return;
  }
  return forwardResponse(response,res,transport.execution.getStore()?.signal);
 }});
 const service={call(method,input,signal){
  if(method==="compare.request")return transport.request(input,signal);
  if(method==="compare.poll")return transport.poll(input,signal);
  if(method==="compare.cancel")return transport.cancel(input);
  if(method==="desktop.preferencesRead")return Object.fromEntries((input?.keys||[]).map(key=>[key,api.settings.get("ui."+key,null)]).filter(([,value])=>value!==null));
  throw Error("Unknown comparison operation");
 },dispose:()=>transport.dispose()};
 const unprovide=api.services?.provide?.("kai.model-compare",{methods:["request","poll","cancel"],call:(method,input,context)=>service.call("compare."+method,input,context?.signal)});
 const dispose=service.dispose;service.dispose=async()=>{unprovide?.();await dispose();};
 return service;
}
module.exports={create};
