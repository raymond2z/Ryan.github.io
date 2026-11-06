(function(root){
'use strict';
function endpoint(raw){const u=new URL(raw);if(u.origin!=='https://script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)||u.search||u.hash)throw Error('Use the Google Apps Script deployment URL ending in /exec.');return u.href;}
function googleOrigin(raw){try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('-script.googleusercontent.com'));}catch{return false;}}
class Queue{
 constructor({send,status=()=>{},schedule=setTimeout,cancel=clearTimeout,uuid=()=>crypto.randomUUID(),timeout=30000}){Object.assign(this,{send,status,schedule,cancel,uuid,timeout});this.pending=null;this.active=null;this.config=null;this.attempts=0;this.timer=null;this.revision=0;}
 configure(config){this.stop();this.config=config?{endpoint:endpoint(config.endpoint),code:config.code}:null;this.attempts=0;if(this.config)this.flush();else this.status('local');}
 enqueue(doc){this.pending={raw:JSON.stringify(doc),revision:++this.revision};this.attempts=0;if(!this.config){this.status('local');return;}this.status('pending');if(!this.active){this.cancel(this.timer);this.timer=this.schedule(()=>this.flush(),1500);}}
 flush(){if(!this.config||!this.pending||this.active)return;if(this.attempts>=3){this.status('failed');return;}this.attempts++;const item={...this.pending,id:this.uuid()};this.active=item;this.status('sending');this.timer=this.schedule(()=>this.fail(),this.timeout);try{this.send({...item,...this.config});}catch{this.fail();}}
 acknowledge(origin,message){if(!googleOrigin(origin)||!this.active||message?.type!=='classroom-receipt'||message.request!==this.active.id)return false;if(message.ok!==true||typeof message.receipt!=='string'||!message.receipt){this.fail();return true;}const sent=this.active;this.cancel(this.timer);this.active=null;this.attempts=0;if(this.pending?.revision===sent.revision)this.pending=null;this.status(this.pending?'pending':'received',message.receipt);if(this.pending)this.flush();return true;}
 fail(){if(!this.active)return;this.cancel(this.timer);this.active=null;if(this.attempts<3){this.status('retrying');this.timer=this.schedule(()=>this.flush(),this.attempts*4000);}else this.status('failed');}
 retry(){this.attempts=0;this.cancel(this.timer);if(!this.active)this.flush();}
 stop(){this.cancel(this.timer);this.active=null;}
}
const api={Queue,endpoint,googleOrigin};root.ExperimentSync=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
