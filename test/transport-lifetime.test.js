"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createTransport}=require("../plugin/service/transport");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test("preparing a model does not expire as an unread stream before its handle is returned",async()=>{
 let signal,proceed;
 const ready=new Promise(resolve=>proceed=resolve);
 const transport=createTransport({idleTimeoutMs:15,sweepMs:5,async route(req,res){signal=transport.execution.getStore().signal;await ready;signal.throwIfAborted();res.writeHead(200,{"content-type":"text/event-stream"});res.end("data: ready\n\n");}});
 try{const pending=transport.request({path:"/core/chat/completions",method:"POST",requestId:"preparing"});await sleep(45);assert.equal(signal.aborted,false);proceed();const response=await pending;const chunk=transport.poll(response);assert.equal(chunk.done,true);assert.match(chunk.chunks.join(""),/ready/);}finally{proceed();await transport.dispose();}
});
test("an abandoned returned stream is still cancelled and removed",async()=>{
 let signal;
 const transport=createTransport({idleTimeoutMs:15,sweepMs:5,async route(req,res){signal=transport.execution.getStore().signal;res.writeHead(200,{"content-type":"text/event-stream"});await new Promise(resolve=>signal.addEventListener("abort",resolve,{once:true}));}});
 try{const response=await transport.request({path:"/core/chat/completions",method:"POST"});await sleep(45);assert.equal(signal.aborted,true);assert.throws(()=>transport.poll(response),/Unknown/);}finally{await transport.dispose();}
});
test("a request cancelled before headers aborts work and leaves no pollable stream",async()=>{
 let signal;
 const transport=createTransport({async route(req,res){signal=transport.execution.getStore().signal;await new Promise(resolve=>signal.addEventListener("abort",resolve,{once:true}));signal.throwIfAborted();}});
 try{const pending=transport.request({path:"/core/chat/completions",method:"POST",requestId:"pending"});await sleep(1);transport.cancel({requestId:"pending"});await pending;assert.equal(signal.aborted,true);assert.throws(()=>transport.poll("pending"),/Unknown/);}finally{await transport.dispose();}
});
