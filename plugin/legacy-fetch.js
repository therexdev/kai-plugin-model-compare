"use strict";
(() => {
 const call=(method,input)=>window.kai.call(method,input);
 const encode=new TextEncoder();
 window.KaiLegacyFetch=function(prefix){
  return async function(url,options={}){
   if(typeof url!=="string"||!url.startsWith("/core/"))throw Error("Unsupported feature request");
   options.signal?.throwIfAborted();
   const requestId=crypto.randomUUID();
   let stopped=false,streamController;
   const cleanup=()=>options.signal?.removeEventListener("abort",abort);
   const cancelRemote=()=>call(prefix+".cancel",{requestId}).catch(()=>{});
   const abort=()=>{void cancelRemote();stopped=true;cleanup();if(streamController){try{streamController.error(options.signal.reason);}catch{}}};
   options.signal?.addEventListener("abort",abort,{once:true});
   try {
    const result=await call(prefix+".request",{path:url,method:options.method||"GET",body:options.body,requestId});
    if(options.signal?.aborted){await cancelRemote();options.signal.throwIfAborted();}
    if(result.streamId){
     const streamId=result.streamId;
     const body=new ReadableStream({
      start(controller){streamController=controller;},
      async pull(controller){
       try {
        // An empty poll must keep this pull pending. Returning without an
        // enqueue/close leaves a waiting reader stuck and does not schedule
        // another pull when the native service later receives tokens.
        while(!stopped){
         options.signal?.throwIfAborted();
         const chunk=await call(prefix+".poll",{streamId});
         if(stopped)return;
         if(chunk.error)throw Error(chunk.error);
         const parts=(chunk.chunks||[]).filter(part=>part.length>0);
         for(const part of parts)controller.enqueue(encode.encode(part));
         if(chunk.done){stopped=true;cleanup();controller.close();return;}
         if(parts.length)return;
         await new Promise(resolve=>setTimeout(resolve,100));
        }
       }catch(error){
        if(stopped)return;
        stopped=true;cleanup();void cancelRemote();controller.error(error);
       }
      },
      cancel(){stopped=true;cleanup();return cancelRemote();}
     });
     return new Response(body,{status:result.status||200,headers:result.headers});
    }
    stopped=true;cleanup();
    return new Response(typeof result.body==="string"?result.body:JSON.stringify(result.body),{status:result.status||200,headers:result.headers});
   }catch(error){cleanup();if(options.signal?.aborted)options.signal.throwIfAborted();return new Response(JSON.stringify({ok:false,error:prefix==="tools.ui"?error.message:{message:error.message}}),{status:400,headers:{"content-type":"application/json"}});}
  };
 };
})();
