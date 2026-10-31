"use strict";
// Author integration only. Plugin payloads use the public SDK; this harness
// starts the real Core gateway/SDK with a synthetic HTTP model and profiles.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),assert=require("node:assert/strict"),vm=require("node:vm"),crypto=require("node:crypto");
const coreRoot=path.resolve(process.env.KAI_CORE_SOURCE||"../kai-core"),documentsRoot=path.resolve(process.env.KAI_DOCUMENTS_SOURCE||"../kai-plugin-documents"),compareRoot=path.resolve(__dirname,"..");
const {RuntimeManager}=require(path.join(coreRoot,"core/lib/runtime-manager")),{Gateway}=require(path.join(coreRoot,"core/lib/gateway")),{createFoundationApi}=require(path.join(coreRoot,"electron/foundation-api"));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message){const deadline=Date.now()+5000;while(!check()&&Date.now()<deadline)await sleep(5);assert.ok(check(),message);}
function finishWithin(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Renderer stream did not complete")),8000);})]).finally(()=>clearTimeout(timer));}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener("abort",abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));if(signal.aborted)abort();});}
function renderer(root,service,isCompare){
 const context={window:{kai:{call:async(method,input)=>service.call(method,input)}},document:{getElementById(){}},TextEncoder,TextDecoder,ReadableStream,Response,DOMException,crypto:{randomUUID:crypto.randomUUID},setTimeout};
 for(const file of isCompare?["legacy-fetch.js","app.js"]:["bridge.js"])vm.runInNewContext(fs.readFileSync(path.join(root,"plugin",file),"utf8"),context);
 return async(model,prompt,signal)=>{const response=await context.window.fetch("/core/chat/completions",{method:"POST",signal,body:JSON.stringify({model,messages:[{role:"user",content:prompt}],stream:true,max_tokens:1024})});if(!response.ok)throw Error(await response.text());let text="";for await(const event of context.sseDeltas(response.body))text+=event.content;return text;};
}
async function main(){
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"kai-cross-plugin-inference-"))),held=new Map(),seen=[],starts=[],controllers=[],services=[];
 let engine,gateway,runtime,active=0,maxActive=0,slowSignal;
 const slow=deferred(),checks=[];
 try{
  engine=http.createServer((req,res)=>{let raw="";req.on("data",part=>raw+=part);req.on("end",()=>{
   const body=JSON.parse(raw),prompt=body.messages.at(-1).content;seen.push({model:body.model,prompt});active++;maxActive=Math.max(maxActive,active);
   let ended=false;const finish=()=>{if(!ended){ended=true;active--;}};res.on("close",finish);
   const token=text=>res.write('data: '+JSON.stringify({model:body.model,choices:[{delta:{content:text}}]})+'\n\n');
   const complete=()=>{token(prompt+" complete");res.end("data: [DONE]\n\n");finish();};
   res.writeHead(200,{"content-type":"text/event-stream"});res.flushHeaders();
   if(prompt.endsWith("hold"))held.set(prompt,{res,complete,token});else setTimeout(complete,240);
  });});
  await new Promise(resolve=>engine.listen(0,"127.0.0.1",resolve));
  const models={aliases:()=>["model-a","model-b","model-slow"].map(alias=>({alias,label:alias,status:"ready"})),resolveAlias:alias=>({packageId:alias,contextSize:4096,runtime:"llamacpp"}),ensurePackage:async(alias,{signal})=>{if(alias==="model-slow"){slowSignal=signal;await abortable(slow.promise,signal);}return alias;}};
  runtime=new RuntimeManager({models,makeRuntime:()=>{let running=false;return{endpoint:`http://127.0.0.1:${engine.address().port}`,status:()=>({running,kind:"llamacpp"}),start:async({modelPath})=>{starts.push(modelPath);running=true;},stop:()=>{running=false;}};}});
  gateway=new Gateway({port:0,runtime,models,keys:{required:()=>false}});await gateway.listen();
  const core={runtime,models,gateway,settings:{get:(_key,fallback)=>fallback}},ctx={core,electron:{},isClosing:()=>false};
  const serviceFor=(root,slug)=>{const dataDir=path.join(temp,"plugins",slug);fs.mkdirSync(dataDir,{recursive:true});const controller=new AbortController();controllers.push(controller);const api=createFoundationApi(ctx,{manifest:JSON.parse(fs.readFileSync(path.join(root,"plugin/manifest.json"),"utf8")),root:path.join(root,"plugin"),dataDir,controller});api.services={provide:()=>()=>{}};const service=require(path.join(root,"plugin/service")).create(api);services.push(service);return service;};
  const compare=renderer(compareRoot,serviceFor(compareRoot,"compare"),true),documents=renderer(documentsRoot,serviceFor(documentsRoot,"documents"),false);

  const comparisons=(async()=>[await compare("model-a","compare hold"),await compare("model-b","compare second")])();
  await until(()=>held.has("compare hold"),"Compare did not reach the real Core gateway");
  const cancelDocs=new AbortController(),cancelledDocument=documents("model-b","cancelled document",cancelDocs.signal),documentRejected=assert.rejects(cancelledDocument,{name:"AbortError"});
  await until(()=>runtime.status().inference.queued===1,"Documents was not queued behind Compare");cancelDocs.abort();await documentRejected;
  await until(()=>runtime.status().inference.queued===0,"Documents cancellation did not leave the Core queue");
  assert.equal(held.get("compare hold").res.destroyed,false);assert.equal(runtime.activeAlias,"model-a");
  const writing=documents("model-b","document hold");await until(()=>runtime.status().inference.queued===1,"Document retry did not queue");
  // Several empty polls occur before the first token; both bridges must keep reading.
  await sleep(240);held.get("compare hold").complete();
  await until(()=>held.has("document hold"),"Documents never received its runtime turn");
  await until(()=>runtime.status().inference.queued===1,"Compare second answer did not wait behind Documents");
  assert.equal(active,1);held.get("document hold").complete();
  assert.equal(await finishWithin(writing),"document hold complete");assert.deepEqual(await finishWithin(comparisons),["compare hold complete","compare second complete"]);
  assert.deepEqual(seen.map(row=>row.prompt),["compare hold","document hold","compare second"]);assert.equal(maxActive,1);
  checks.push("Delayed Compare and Documents streams complete through real Core FIFO without overlap; stopping queued Documents preserves Compare");

  const holdingDocument=documents("model-b","document second hold");await until(()=>held.has("document second hold"),"Document hold did not start");
  const cancelCompare=new AbortController(),queuedCompare=compare("model-a","cancelled comparison",cancelCompare.signal),comparisonRejected=assert.rejects(queuedCompare,{name:"AbortError"});
  await until(()=>runtime.status().inference.queued===1,"Compare did not queue behind Documents");cancelCompare.abort();await comparisonRejected;
  await until(()=>runtime.status().inference.queued===0,"Compare cancellation remained queued");assert.equal(held.get("document second hold").res.destroyed,false);
  held.get("document second hold").complete();await finishWithin(holdingDocument);assert.ok(!seen.some(row=>row.prompt==="cancelled comparison"));
  checks.push("Stopping queued Compare cancels only its request and leaves Documents running");

  const preparing=new AbortController(),slowReply=compare("model-slow","never run",preparing.signal),slowRejected=assert.rejects(slowReply,{name:"AbortError"});
  await until(()=>slowSignal,"Model preparation did not start");preparing.abort();await slowRejected;
  await until(()=>slowSignal.aborted&&!runtime.status().loading,"Preparation was not cancelled before headers");slow.resolve();
  assert.ok(!starts.includes("model-slow"));assert.ok(!seen.some(row=>row.prompt==="never run"));
  assert.equal(await finishWithin(compare("model-a","retry after preparation")),"retry after preparation complete");
  await until(()=>runtime.status().inference.activeAlias===null&&runtime._inflight===0,"Runtime lease remained after completion");
  checks.push("Compare Stop during preparation prevents an orphan model launch and permits a clean retry");
  console.log(JSON.stringify({realCoreGateway:true,realFoundationApi:true,realPluginServices:true,realRendererBridges:true,syntheticEngine:true,liveModels:false,checks},null,2));
 }finally{
  slow.resolve();for(const controller of controllers)controller.abort();for(const service of services)await service.dispose();
  if(gateway)await gateway.close();if(runtime)await runtime.stop();if(engine){engine.closeAllConnections();await new Promise(resolve=>engine.close(resolve));}
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
