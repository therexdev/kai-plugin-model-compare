"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{randomUUID}=require("node:crypto");
const {create}=require("../plugin/service");
const fixture=require("./native-fixture");
function screen(service){
 const elements=new Map(),statuses=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:({"cmp-a":"a","cmp-b":"b","cmp-tokens":"1024","cmp-input":"Write one sentence."})[id]||"",hidden:true,disabled:false,innerHTML:"",textContent:"",listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},appendChild(){},focus(){}});return elements.get(id);};
 const context={document:{getElementById:element,createElement:()=>({addEventListener(){}})},window:{kai:{call:async(method,input)=>service.call(method,input)}},TextEncoder,TextDecoder,ReadableStream,Response,DOMException,AbortController,crypto:{randomUUID},performance,Math:Object.assign(Object.create(Math),{random:()=>0}),setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,2)),mdToHtml:s=>`<p>${s}</p>`,KaiI18n:{setText(el,text){el.textContent=text;if(el===element("cmp-status"))statuses.push(text);},html:x=>x,message:(parts,...args)=>parts.map((p,i)=>p+(args[i]??"")).join("")},localStorage:{getItem:()=>null,setItem(){}}};
 for(const file of ["legacy-fetch.js","app.js","compare.js"])vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../plugin",file),"utf8"),context);
 // Browser fetch is a global alias of window.fetch; the VM keeps them distinct.
 context.fetch=context.window.fetch;
 return{element,statuses,submit:()=>element("cmp-form").listeners.submit({preventDefault(){}}),stop:()=>element("cmp-stop").listeners.click()};
}
const frame=text=>new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function deadline(p){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error("Comparison stalled")),2000))]).finally(()=>clearTimeout(timer));}
test("real Compare service and renderer finish delayed first/second answers sequentially with a bounded reply",async()=>{
 let active=0,maxActive=0;const calls=[];
 const f=fixture("model-compare",{request:async(input,signal)=>{calls.push(input);active++;maxActive=Math.max(maxActive,active);await sleep(12);return new Response(new ReadableStream({async start(c){await sleep(12);c.enqueue(frame(input.model+" first "));await sleep(15);c.enqueue(frame("last"));active--;c.close();}}),{headers:{"content-type":"text/event-stream"}});}}),service=create(f.api),ui=screen(service);
 try{const running=ui.submit();assert.equal(ui.element("cmp-run").disabled,true);assert.match(ui.element("cmp-status").textContent,/Preparing or waiting/);await deadline(running);assert.deepEqual(calls.map(c=>c.model),["a","b"]);assert.ok(calls.every(c=>c.max_tokens===1024));assert.equal(maxActive,1);assert.match(ui.element("cmp-body-0").innerHTML,/a first last/);assert.match(ui.element("cmp-body-1").innerHTML,/b first last/);assert.equal(ui.element("cmp-verdict").hidden,false);assert.equal(ui.element("cmp-run").disabled,false);assert.ok(ui.statuses.includes("First model answering…"));assert.ok(ui.statuses.includes("Second model answering…"));}finally{await service.dispose();f.cleanup();}
});
test("Stop while preparing prevents the second model and a new comparison can retry",async()=>{
 let first=true,aborted=false;const calls=[];
 const f=fixture("model-compare",{request:async(input,signal)=>{calls.push(input.model);if(first){first=false;await new Promise((resolve,reject)=>signal.addEventListener("abort",()=>{aborted=true;reject(signal.reason);},{once:true}));}return new Response('data: {"choices":[{"delta":{"content":"Recovered"}}]}\n\ndata: [DONE]\n\n',{headers:{"content-type":"text/event-stream"}});}}),service=create(f.api),ui=screen(service);
 try{const run=ui.submit();await sleep(8);ui.stop();await deadline(run);assert.equal(aborted,true);assert.deepEqual(calls,["a"]);assert.equal(ui.element("cmp-status").textContent,"Stopped.");assert.equal(ui.element("cmp-run").disabled,false);await deadline(ui.submit());assert.deepEqual(calls,["a","a","b"]);assert.equal(ui.element("cmp-verdict").hidden,false);}finally{await service.dispose();f.cleanup();}
});
test("an engine error frame leaves a readable failure and does not mark a comparison complete",async()=>{
 let calls=0;
 const f=fixture("model-compare",{request:async()=>{calls++;return new Response('data: {"error":{"message":"The engine stopped"}}\n\n',{headers:{"content-type":"text/event-stream"}});}}),service=create(f.api),ui=screen(service);
 try{await deadline(ui.submit());assert.equal(calls,1);assert.match(ui.element("cmp-status").textContent,/engine stopped/);assert.equal(ui.element("cmp-verdict").hidden,true);assert.equal(ui.element("cmp-run").disabled,false);}finally{await service.dispose();f.cleanup();}
});
