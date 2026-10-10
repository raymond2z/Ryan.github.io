// Opt-in scheduling experiments. The numerical solver, grid and Worker cap stay fixed.
export const GPU_EXPERIMENT_BUILD='gpu-throughput-20261010';
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
    delay(now){return nextDue===null?0:Math.max(0,nextDue-now);},
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

// One cancellable timer; a busy Worker suspends ticks until its reply wakes us.
// Timer deadlines remain browser wall clocks, independent of animation callbacks.
export function createGpuFlowLoop({tick,clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}){
  let active=false,timer=null,generation=0;
  const arm=delay=>{const epoch=generation;timer=schedule(()=>run(epoch),Math.max(0,delay));};
  function run(epoch){
    if(!active||epoch!==generation)return;
    timer=null;const delay=tick(clock());
    if(active&&epoch===generation&&timer===null&&Number.isFinite(delay))arm(Math.max(1,delay));
  }
  return {
    get active(){return active;},
    start(){if(!active){active=true;generation++;arm(0);}},
    wake(){if(!active)return;if(timer!==null)cancel(timer);timer=null;generation++;arm(0);},
    stop(){active=false;generation++;if(timer!==null)cancel(timer);timer=null;}
  };
}

const p95=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*.95)-1]??null;};
const valid=value=>Number.isFinite(value)&&value>0;
const bounded=(list,value)=>{list.push(value);if(list.length>120)list.shift();};
const rates=[15,20,30,40,60];
const policyKey=p=>`${p.updateHz}/${p.batch}`;
const weighted=(samples,key)=>samples.length?samples.reduce((n,s)=>n+s[key]*s.seconds,0)/samples.reduce((n,s)=>n+s.seconds,0):null;

// Keep one accepted numerical policy. Change one variable, measure three clean
// windows, then retain a real throughput gain or restore the accepted policy.
// Presentation pressure never directly shrinks a solver batch.
export function createGpuLoadGovernor(){
  let paintHz=60,updateHz=30,batch=8,worker=[],visual=[],delivery=null,lastWindow=null;
  let badPaint=0,badFlow=0,goodPaint=0,paintRecoveryAfter=0,settled=[],probe=null;
  let nextTrialAfter=0,lastTrial=null,accepted={updateHz:30,batch:8},interrupted=false;
  const blocked=new Map();
  function clearEvidence(){worker=[];visual=[];delivery=null;settled=[];badPaint=0;badFlow=0;goodPaint=0;interrupted=false;}
  return {
    get state(){return {paintHz,updateHz,batch};},
    get optimization(){return {objective:'solver steps/s',phase:probe?'measuring trial':'holding',
      acceptedPolicy:{...accepted},candidatePolicy:probe?{...probe.candidate}:null,
      referenceStepsPerSecond:probe?.reference??weighted(settled,'stepsHz'),
      validTrialWindows:probe?.samples.length??0,lastTrial:structuredClone(lastTrial)};},
    reset(){paintHz=60;updateHz=30;batch=8;clearEvidence();lastWindow=null;probe=null;
      nextTrialAfter=0;lastTrial=null;accepted={updateHz:30,batch:8};blocked.clear();paintRecoveryAfter=0;},
    observeWorker({steps,workerMs,roundTripMs}){
      if(!Number.isInteger(steps)||steps<1||steps>24||!valid(workerMs)||!valid(roundTripMs)||roundTripMs<workerMs)return;
      bounded(worker,{steps,workerMs,roundTripMs});
    },
    observeVisual(workMs){if(valid(workMs))bounded(visual,workMs);},
    observeRates(sample,now){
      delivery=null;
      if(!Number.isFinite(now))return;
      if(!sample.running||sample.hidden||sample.interacting||sample.interrupted){interrupted=true;return;}
      if(sample.policyChanged)return;
      if(!Number.isFinite(sample.durationMs)||sample.durationMs<500||sample.durationMs>2500)return;
      if(!['paints','snapshots','steps','animationFrames','demandStepsPerSecond','tracerDroppedStepsDelta'].every(k=>Number.isFinite(sample[k])&&sample[k]>=0))return;
      if(sample.experimentPolicy?.paintHz!==paintHz||sample.experimentPolicy?.updateHz!==updateHz||sample.experimentPolicy?.batch!==batch)return;
      const seconds=sample.durationMs/1000;
      delivery={timestamp:now,seconds,paintHz:sample.paints/seconds,flowHz:sample.snapshots/seconds,
        stepsHz:sample.steps/seconds,callbackHz:sample.animationFrames/seconds,
        paintTarget:paintHz,flowTarget:updateHz,batch,
        demand:sample.demandStepsPerSecond,paintEligible:sample.particlesEnabled&&sample.demandStepsPerSecond>=paintHz,
        flowEligible:sample.demandStepsPerSecond>=updateHz,backlog:sample.tracerDroppedStepsDelta>0};
    },
    evaluate(now,{allowBatch=true}={}){
      if(!Number.isFinite(now))return [];
      const changes=[];
      let evidence={workerP95:null,workerWorkP95:null,visualP95:null,measuredPaintHz:null,measuredFlowHz:null,
        measuredStepsPerSecond:null,animationCallbackHz:null};
      const change=(control,to,reason)=>{
        const from={paintHz,updateHz,batch}[control];if(from===to)return;
        changes.push({control,from,to,reason,...evidence});
        if(control==='paintHz')paintHz=to;else if(control==='updateHz')updateHz=to;else batch=to;
      };
      const finishTrial=(keep,reason)=>{
        const trial=probe;if(!trial)return;
        const score=weighted(trial.samples,'stepsHz');
        if(!keep){
          blocked.set(policyKey(trial.candidate),now+60000);
          change('updateHz',trial.from.updateHz,'restore accepted cadence: '+reason);
          change('batch',trial.from.batch,'restore accepted batch: '+reason);
        }else blocked.set(policyKey(trial.from),now+60000);
        accepted={updateHz,batch};
        lastTrial={decision:keep?'retained':'restored',reason,from:trial.from,candidate:trial.candidate,
          baselineStepsPerSecond:trial.reference,trialStepsPerSecond:score,
          changePercent:score!==null&&trial.reference>0?(score/trial.reference-1)*100:null,
          validWindows:trial.samples.length};
        changes.push({control:'throughputTrial',from:trial.reference,to:score,reason,...evidence,trial:structuredClone(lastTrial)});
        settled=keep?trial.samples.slice(-3):[];probe=null;nextTrialAfter=now+(keep?3000:10000);
      };
      if(lastWindow===null||now<lastWindow||now-lastWindow>2500){
        finishTrial(false,'timing interrupted; discard trial');clearEvidence();lastWindow=now;return changes;
      }
      if(interrupted){finishTrial(false,'user activity interrupted trial');clearEvidence();lastWindow=now;return changes;}
      if(now-lastWindow<1000)return [];
      lastWindow=now;
      const w=worker,v=visual,r=delivery;worker=[];visual=[];delivery=null;
      const measured=r&&now>=r.timestamp&&now-r.timestamp<=2500&&r.paintTarget===paintHz&&r.flowTarget===updateHz&&r.batch===batch;
      if(probe&&now-probe.startedAt>15000){finishTrial(false,'insufficient clean trial windows');return changes;}
      if(w.length<6||v.length<6){settled=[];badPaint=0;badFlow=0;goodPaint=0;return [];}
      const workerP95=p95(w.map(s=>s.roundTripMs)),workerWorkP95=p95(w.map(s=>s.workerMs)),visualP95=p95(v);
      evidence={workerP95,workerWorkP95,visualP95,measuredPaintHz:measured?r.paintHz:null,
        measuredFlowHz:measured?r.flowHz:null,measuredStepsPerSecond:measured?r.stepsHz:null,
        animationCallbackHz:measured?r.callbackHz:null};
      badPaint=measured&&r.paintEligible&&r.paintHz<paintHz*.75?badPaint+1:0;
      badFlow=measured&&r.flowEligible&&r.flowHz<updateHz*.65?badFlow+1:0;
      const paintFloor=r?.paintTarget===30?Math.min(30,r.callbackHz):r?.paintTarget;
      const paintDelivered=measured&&(!r.paintEligible||r.paintHz>=paintFloor*.85);
      if((paintHz===60&&badPaint>=3)||visualP95>1000/paintHz*.55){
        if(paintHz!==30){
          finishTrial(false,'drawing policy changed; recalibrate throughput');
          change('paintHz',30,badPaint>=3?'three windows below measured paint target':'visual work exceeds frame headroom');
          settled=[];
        }
        paintRecoveryAfter=now+15000;goodPaint=0;
      }else if(paintHz===30){
        goodPaint=paintDelivered&&r.callbackHz>=55&&visualP95<6&&now>=paintRecoveryAfter?goodPaint+1:0;
        if(goodPaint>=3){
          finishTrial(false,'drawing policy changed; recalibrate throughput');
          change('paintHz',60,'three windows of actual visual headroom');settled=[];goodPaint=0;
        }
      }
      // A ceiling persistently far above delivery is lowered without reducing
      // the batch. Worker RTT includes fixed readback/messaging overhead.
      if(badFlow>=3){
        if(probe){finishTrial(false,'sustained delivery shortfall');badFlow=0;return changes;}
        const index=rates.indexOf(updateHz);
        change('updateHz',rates[Math.max(0,index-1)],'align cadence with measured delivery; preserve batch');
        accepted={updateHz,batch};settled=[];badFlow=0;nextTrialAfter=now+10000;
      }
      if(changes.some(c=>['paintHz','updateHz','batch'].includes(c.control)))return changes;
      if(!measured){settled=[];goodPaint=0;return changes;}
      const sample={seconds:r.seconds,stepsHz:r.stepsHz,workerP95,paintHz:r.paintHz};
      if(probe){
        probe.samples.push(sample);
        probe.badWindows=r.stepsHz<probe.reference*.8?probe.badWindows+1:0;
        if(probe.badWindows>=2)finishTrial(false,'two windows of throughput regression');
        else if(probe.samples.length>=3){
          const score=weighted(probe.samples,'stepsHz');
          const lessRequests=probe.candidate.updateHz<probe.from.updateHz&&probe.candidate.batch===probe.from.batch;
          const keep=score>=probe.reference*(lessRequests ? .98 : 1.05);
          finishTrial(keep,keep?(lessRequests?'same throughput with fewer requests':'measured throughput gain'):'trial did not improve solver steps/s');
        }
        return changes;
      }
      settled.push(sample);if(settled.length>3)settled.shift();
      if(settled.length<3||now<nextTrialAfter||!paintDelivered)return changes;
      const reference=weighted(settled,'stepsHz');
      if(!(reference>0)||reference>=r.demand*.95)return changes; // Demand already fulfilled.
      const full=w.filter(s=>s.steps>=batch),fullEnough=full.length>=6,index=rates.indexOf(updateHz);
      const candidates=[];
      if(allowBatch&&fullEnough&&workerWorkP95>30&&batch>4)candidates.push({updateHz,batch:batch-2});
      if(allowBatch&&fullEnough&&batch<24)candidates.push({updateHz,batch:Math.min(24,batch+2)});
      if(index<rates.length-1&&r.flowEligible&&r.flowHz>=updateHz*.85)candidates.push({updateHz:rates[index+1],batch});
      if(allowBatch&&fullEnough&&batch>4)candidates.push({updateHz,batch:batch-2});
      if(index>0)candidates.push({updateHz:rates[index-1],batch});
      for(const [key,until]of blocked)if(until<=now)blocked.delete(key);
      const candidate=candidates.find(p=>(blocked.get(policyKey(p))??0)<=now);
      if(!candidate)return changes;
      probe={from:{updateHz,batch},candidate,reference,startedAt:now,samples:[],badWindows:0};
      change('updateHz',candidate.updateHz,'throughput trial: change cadence and keep batch');
      change('batch',candidate.batch,'throughput trial: change batch and keep cadence');
      return changes;
    }
  };
}

// Budget visual marker work separately. The fluid grid and solver steps are
// untouched. Midpoint integration keeps the existing <=2-step substeps.
export function createGpuTracerBudget({baseCount}){
  if(!Number.isInteger(baseCount)||baseCount<64)throw Error('Invalid tracer count');
  let count=baseCount,lastReduction=-Infinity,lastRecovery=-Infinity;
  return {
    get count(){return count;},
    reset(){count=baseCount;lastReduction=-Infinity;lastRecovery=-Infinity;},
    next({debt,split=false,now}){
      if(!Number.isFinite(debt)||debt<0||!Number.isFinite(now))throw Error('Invalid tracer budget');
      const portion=Math.min(debt,64,split?Math.ceil(debt/2):debt);
      const desired=Math.max(Math.max(24,Math.floor(baseCount/3)),Math.min(baseCount,Math.floor(baseCount*12/Math.max(12,Math.ceil(portion/2)))));
      const from=count;
      if(desired<count){count=desired;lastReduction=now;}
      else if(desired>count&&now-lastReduction>=3000&&now-lastRecovery>=3000){
        count=Math.min(desired,count+Math.ceil(baseCount*.1));lastRecovery=now;
      }
      return {portion,count,changed:from!==count,from};
    }
  };
}
