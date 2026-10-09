// Node-only bridge for testing the browser module Worker protocol against real Rust WASM.
import {parentPort} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
globalThis.self=globalThis;
globalThis.postMessage=(message,transfer=[])=>parentPort.postMessage(message,transfer);
globalThis.fetch=async url=>{
  const bytes=readFileSync(url);
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
};
await import('./student-wasm-worker.mjs');
parentPort.on('message',data=>globalThis.onmessage({data}));
