// Opt-in scheduling experiments. The numerical solver, grid and Worker cap stay fixed.
export const GPU_EXPERIMENT_BUILD='gpu-cadence-20261010';
export const GPU_PROFILES={
  baseline:{label:'30 paint / 30 flow',paintHz:30,updateHz:30},
  display60:{label:'60 paint / 30 flow',paintHz:60,updateHz:30},
  flow60:{label:'60 paint / 60 flow',paintHz:60,updateHz:60},
  auto60:{label:'Auto · up to 60 paint / 60 flow',paintHz:60,updateHz:30}
};
export function experimentSettings({enabled=false,search=''}={}){
  const params=new URLSearchParams(search),profile=params.get('profile');
  return {enabled,profile:enabled&&Object.hasOwn(GPU_PROFILES,profile)?profile:'baseline',
    paceMultiplier:enabled&&params.get('pace')==='2'?2:1};
}

// Absolute deadlines avoid the 40 Hz request gate becoming 30 Hz on a 60 Hz display.
// One caller-owned in-flight slot provides backpressure; missed deadlines are skipped.
export function createGpuRequestPacer({hz=30,alignmentMs=1.5}={}){
  if(!Number.isFinite(hz)||hz<1||hz>60||!Number.isFinite(alignmentMs)||alignmentMs<0||alignmentMs>2)throw Error('Invalid GPU request rate');
  let nextDue=null,rate=hz;
  return {
    reset(){nextDue=null;},
    setRate(hz){if(!Number.isFinite(hz)||hz<1||hz>60)throw Error('Invalid GPU request rate');if(hz!==rate){rate=hz;nextDue=null;}},
    get rate(){return rate;},
    shouldRequest({now,hasWork,busy=false}){
      if(!Number.isFinite(now)||!hasWork||busy)return false;
      const interval=1000/rate;
      if(nextDue===null){nextDue=now+interval;return true;}
      if(now+alignmentMs<nextDue)return false;
      nextDue+=Math.max(1,Math.floor((now+alignmentMs-nextDue)/interval)+1)*interval;
      return true;
    }
  };
}

const p95=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*.95)-1]??null;};
const valid=value=>Number.isFinite(value)&&value>0;
const bounded=(list,value)=>{list.push(value);if(list.length>120)list.shift();};
const rates=[15,20,30,40,60];
export function createGpuLoadGovernor(){
  let paintHz=60,updateHz=30,batch=8,worker=[],visual=[],lastWindow=null,goodFlow=0,goodPaint=0;
  return {
    get state(){return {paintHz,updateHz,batch};},
    reset(){paintHz=60;updateHz=30;batch=8;worker=[];visual=[];lastWindow=null;goodFlow=0;goodPaint=0;},
    observeWorker({steps,workerMs,roundTripMs}){
      if(!Number.isInteger(steps)||steps<1||steps>24||!valid(workerMs)||!valid(roundTripMs)||roundTripMs<workerMs)return;
      bounded(worker,{steps,ms:roundTripMs});
    },
    observeVisual(workMs){if(valid(workMs))bounded(visual,workMs);},
    evaluate(now,{allowBatch=true}={}){
      if(!Number.isFinite(now))return [];
      if(lastWindow===null||now<lastWindow){lastWindow=now;worker=[];visual=[];goodFlow=0;goodPaint=0;return [];}
      if(now-lastWindow<1000)return [];
      if(now-lastWindow>2500){lastWindow=now;worker=[];visual=[];goodFlow=0;goodPaint=0;return [];}
      lastWindow=now;
      const w=worker,v=visual;worker=[];visual=[];
      if(w.length<6||v.length<6){goodFlow=0;goodPaint=0;return [];}
      const workerP95=p95(w.map(s=>s.ms)),visualP95=p95(v),changes=[];
      const change=(control,to,reason)=>{
        const from={paintHz,updateHz,batch}[control];if(from===to)return;
        changes.push({control,from,to,reason,workerP95,visualP95});
        if(control==='paintHz')paintHz=to;else if(control==='updateHz')updateHz=to;else batch=to;
      };
      const visualOverload=visualP95>1000/paintHz*.55;
      if(visualOverload){change('paintHz',30,'visual work exceeds frame headroom');goodPaint=0;}
      else if(paintHz===30){
        goodPaint=visualP95<6?goodPaint+1:0;
        if(goodPaint>=3){change('paintHz',60,'three windows of visual headroom');goodPaint=0;}
      }
      const index=rates.indexOf(updateHz),interval=1000/updateHz;
      if(workerP95>interval*.9||visualOverload){
        if(allowBatch&&(workerP95>interval*.72||visualOverload))change('batch',Math.max(4,batch-2),visualOverload?'reduce visual advection demand':'Worker turnaround exceeds budget');
        change('updateHz',rates[Math.max(0,index-1)],visualOverload?'reduce requests under visual load':'Worker turnaround exceeds update interval');
        goodFlow=0;
      }else{
        const next=rates[Math.min(rates.length-1,index+1)];
        goodFlow=workerP95<1000/next*.75&&visualP95<1000/paintHz*.4?goodFlow+1:0;
        if(next>updateHz&&goodFlow>=3){change('updateHz',next,'three windows of Worker and visual headroom');goodFlow=0;}
        // Do not tune partial, demand-limited packets as though they were full batches.
        const full=w.filter(s=>s.steps>=batch);
        if(allowBatch&&full.length>=6){
          const fullP95=p95(full.map(s=>s.ms)),budget=1000/updateHz*.72;
          if(fullP95>budget)change('batch',Math.max(4,batch-2),'bounded batch meets current cadence budget');
          else if(fullP95<budget*.65)change('batch',Math.min(24,batch+2),'bounded batch uses available headroom');
        }
      }
      return changes;
    }
  };
}
