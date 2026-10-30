"use strict";
(() => {
 const call=(method,input)=>window.kai.call(method,input);
 const encode=new TextEncoder();
 window.KaiLegacyFetch=function(prefix){
  return async function(url,options={}){
   if(typeof url!=="string"||!url.startsWith("/core/"))throw Error("Unsupported feature request");
   options.signal?.throwIfAborted();
   const requestId=crypto.randomUUID(), abort=()=>{void call(prefix+".cancel",{requestId}).catch(()=>{});};
   options.signal?.addEventListener("abort",abort,{once:true});
   try {
    const result=await call(prefix+".request",{path:url,method:options.method||"GET",body:options.body,requestId});
    if(options.signal?.aborted){abort();options.signal.throwIfAborted();}
    if(result.streamId){
     const streamId=result.streamId;
     const body=new ReadableStream({async pull(controller){
      try { options.signal?.throwIfAborted(); const chunk=await call(prefix+".poll",{streamId});
       for(const part of chunk.chunks||[])controller.enqueue(encode.encode(part));
       if(!chunk.done&&!(chunk.chunks||[]).length)await new Promise(resolve=>setTimeout(resolve,100));
       if(chunk.error)throw Error(chunk.error);
       if(chunk.done){options.signal?.removeEventListener("abort",abort);controller.close();}
      }catch(error){options.signal?.removeEventListener("abort",abort);abort();controller.error(error);}
     },cancel(){options.signal?.removeEventListener("abort",abort);abort();}});
     return new Response(body,{status:result.status||200,headers:result.headers});
    }
    options.signal?.removeEventListener("abort",abort);
    return new Response(typeof result.body==="string"?result.body:JSON.stringify(result.body),{status:result.status||200,headers:result.headers});
   }catch(error){options.signal?.removeEventListener("abort",abort);if(options.signal?.aborted)options.signal.throwIfAborted();return new Response(JSON.stringify({ok:false,error:prefix==="tools.ui"?error.message:{message:error.message}}),{status:400,headers:{"content-type":"application/json"}});}
  };
 };
})();
