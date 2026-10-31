"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{randomUUID}=require("node:crypto");
function bridge(call) {
 const context={window:{kai:{call}},TextEncoder,TextDecoder,ReadableStream,Response,DOMException,crypto:{randomUUID},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,2))};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../plugin/legacy-fetch.js"),"utf8"),context);
 return context.window.KaiLegacyFetch("compare");
}
function deadline(promise,ms=1000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Stream stalled")),ms);})]).finally(()=>clearTimeout(timer));}
const ready={streamId:"stream",status:200,headers:{"content-type":"text/event-stream"}};
test("first tokens and later tokens continue after multiple empty native polls",async()=>{
 let polls=0,cancels=0;
 const fetch=bridge(async method=>{if(method.endsWith(".request"))return ready;if(method.endsWith(".cancel")){cancels++;return;}polls++;return polls===4?{chunks:["first "]}:polls===8?{chunks:["second"],done:true}:{chunks:[],done:false};});
 const response=await fetch("/core/chat/completions",{method:"POST"});
 assert.equal(await deadline(response.text()),"first second");assert.equal(polls,8);assert.equal(cancels,0);
});
test("Stop rejects a reader waiting through empty polls and cancels its native request",async()=>{
 const controller=new AbortController();let polls=0,cancels=0;
 const fetch=bridge(async method=>{if(method.endsWith(".request"))return ready;if(method.endsWith(".cancel")){cancels++;return;}polls++;return{chunks:[],done:false};});
 const response=await fetch("/core/chat/completions",{signal:controller.signal});
 const reading=response.text();await new Promise(r=>setTimeout(r,15));controller.abort();
 await assert.rejects(deadline(reading),error=>error.name==="AbortError");assert.equal(cancels,1);const count=polls;await new Promise(r=>setTimeout(r,10));assert.equal(polls,count);
});
test("Stop before response headers forwards the request ID and does not begin streaming",async()=>{
 let pending,requestId,cancelId,polls=0;
 const controller=new AbortController(),fetch=bridge(async(method,input)=>{
  if(method.endsWith(".request")){requestId=input.requestId;return new Promise(resolve=>pending=resolve);}
  if(method.endsWith(".cancel")){cancelId=input.requestId;pending(ready);return;}
  polls++;return{chunks:[],done:true};
 });
 const request=fetch("/core/chat/completions",{signal:controller.signal});controller.abort();
 await assert.rejects(deadline(request),error=>error.name==="AbortError");assert.equal(cancelId,requestId);assert.equal(polls,0);
});
test("reader cancellation does not resume polling after a pending poll resolves",async()=>{
 let release,polled=0,cancelled=0;
 const fetch=bridge(async method=>{if(method.endsWith(".request"))return ready;if(method.endsWith(".cancel")){cancelled++;return;}polled++;return new Promise(resolve=>release=resolve);});
 const response=await fetch("/core/chat/completions"),reader=response.body.getReader(),reading=reader.read();
 await new Promise(r=>setTimeout(r,2));await reader.cancel();release({chunks:["late"],done:false});
 assert.equal((await reading).done,true);await new Promise(r=>setTimeout(r,10));assert.equal(polled,1);assert.equal(cancelled,1);
});
test("native stream errors are surfaced and cancellation releases the request",async()=>{
 let cancels=0,polls=0;
 const fetch=bridge(async method=>{if(method.endsWith(".request"))return ready;if(method.endsWith(".cancel")){cancels++;return;}polls++;return polls<3?{chunks:[],done:false}:{chunks:[],done:true,error:"Runtime stopped"};});
 const response=await fetch("/core/chat/completions");await assert.rejects(deadline(response.text()),/Runtime stopped/);assert.equal(cancels,1);
});
function parser(){const context={window:{KaiLegacyFetch:()=>()=>{}},TextDecoder,Error};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../plugin/app.js"),"utf8"),context);return context.sseDeltas;}
async function* bytes(parts){for(const part of parts)yield typeof part==="string"?new TextEncoder().encode(part):part;}
async function collect(source){const result=[];for await(const value of parser()(source))result.push(value.content);return result.join("");}
test("SSE reads CRLF, data without a space, split UTF-8 and a final frame without blank line",async()=>{
 const text='data:{"choices":[{"delta":{"content":"界"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"last"}}]}';
 const data=new TextEncoder().encode(text),cut=data.indexOf(0xe7)+1;
 assert.equal(await collect(bytes([data.slice(0,cut),data.slice(cut)])),"界last");
});
test("model error frames terminate the comparison instead of showing an empty successful answer",async()=>{
 await assert.rejects(collect(bytes(['data: {"error":{"message":"Model context is full"}}\n\n'])),/Model context is full/);
});
