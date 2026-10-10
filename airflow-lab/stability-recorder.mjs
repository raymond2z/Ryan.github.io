// Opt-in wall-clock diagnostics. No solver changes, automatic uploads or PASS claims.
export const STABILITY_BUILD='stage3-4a-20261010';
export function summarize(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return {count:0,mean:null,median:null,p95:null,max:null};
  const n=sorted.length;
  return {count:n,mean:sorted.reduce((a,b)=>a+b,0)/n,
    median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,
    p95:sorted[Math.ceil(n*.95)-1],max:sorted[n-1]};
}
const copy=value=>JSON.parse(JSON.stringify(value));
export function createStabilityRecorder({maxSamples=60000,maxEvents=2000}={}){
  let run=null,lastPaint=null,lastWorker=null,lastConfig=null,lastActivity=null;
  const active=()=>run?.status==='recording';
  const elapsed=now=>Math.max(0,now-run.startedMonotonicMs);
  function event(kind,details={},now){
    if(!active())return;
    if(run.events.length>=maxEvents){run.dropped.events++;return;}
    run.events.push({elapsedMs:elapsed(now),kind,...copy(details)});
  }
  function append(key,sample){
    if(run[key].length<maxSamples)run[key].push(sample);
    else run.dropped[key]++;
  }
  function finish(reason,now,wallTime){
    if(!active())return;
    event('recording_finished',{reason},now);
    run.status=reason==='duration_reached'?'completed':'stopped';
    run.finishReason=reason;run.elapsedMs=elapsed(now);run.finishedAt=wallTime;
  }
  function tick(now,wallTime){
    if(active()&&elapsed(now)>=run.requestedDurationMs)finish('duration_reached',now,wallTime);
    return active();
  }
  function accept(now){
    return active()&&tick(now,new Date().toISOString());
  }
  return {
    get active(){return Boolean(active());},
    get hasReport(){return Boolean(run);},
    start({durationMinutes=5,config,now,wallTime}){
      if(active())throw Error('A stability recording is already running.');
      if(![2,5,10].includes(durationMinutes)||!Number.isFinite(now))throw Error('Invalid stability duration or clock.');
      run={schemaVersion:1,build:STABILITY_BUILD,status:'recording',startedAt:wallTime,
        startedMonotonicMs:now,requestedDurationMs:durationMinutes*60000,
        startConfig:copy(config),workerSamples:[],paintSamples:[],rateWindows:[],events:[],
        dropped:{workerSamples:0,paintSamples:0,rateWindows:0,events:0}};
      lastPaint=null;lastWorker=null;lastConfig=JSON.stringify(config);lastActivity=null;
      event('recording_started',{},now);
    },
    tick,
    stop(now,wallTime){finish('user_stopped',now,wallTime);},
    event,
    observeState(config,activity,now){
      if(!accept(now))return;
      const next=JSON.stringify(config),state=JSON.stringify(activity);
      if(lastConfig!==next){event('settings_changed',{config},now);lastConfig=next;}
      if(lastActivity!==state){event('activity',{...activity},now);lastActivity=state;}
    },
    worker(sample,now){
      if(!accept(now))return;
      if(!Number.isFinite(sample.workerMs)||!Number.isFinite(sample.roundTripMs)||sample.workerMs<0||sample.roundTripMs<0){
        event('invalid_timing_sample',{},now);return;
      }
      const gap=lastWorker===null?null:now-lastWorker;lastWorker=now;
      if(gap>1000)event('worker_sample_gap',{gapMs:gap},now);
      append('workerSamples',{...copy(sample),elapsedMs:elapsed(now),gapMs:gap});
    },
    paint(paintMs,now,details={}){
      if(!accept(now))return;
      if(!Number.isFinite(paintMs)||paintMs<0){event('invalid_timing_sample',{},now);return;}
      const intervalMs=lastPaint===null?null:now-lastPaint;lastPaint=now;
      if(intervalMs>100)event('paint_gap',{gapMs:intervalMs},now);
      append('paintSamples',{...copy(details),elapsedMs:elapsed(now),paintMs,intervalMs});
    },
    rates(window,now){
      if(!accept(now))return;
      // The display's first rate window may have started before recording.
      // Do not count those pre-recording steps as measurement evidence.
      if(window.durationMs>elapsed(now))return;
      append('rateWindows',{...copy(window),elapsedMs:elapsed(now)});
    },
    report(now){
      if(!run)return null;
      const result=copy(run),duration=active()?elapsed(now):run.elapsedMs;
      result.elapsedMs=duration;result.remainingMs=Math.max(0,run.requestedDurationMs-duration);
      const workers=run.workerSamples,paints=run.paintSamples;
      const windows=run.rateWindows;
      const thirds=windows.filter(w=>w.running&&!w.hidden&&!w.interacting&&w.durationMs<=2500);
      const rateMean=items=>items.length?items.reduce((sum,w)=>sum+w.steps,0)/
        (items.reduce((sum,w)=>sum+w.durationMs,0)/1000):null;
      const early=thirds.filter(w=>w.elapsedMs<=run.requestedDurationMs/3);
      const late=thirds.filter(w=>w.elapsedMs>=run.requestedDurationMs*2/3);
      const earlyRate=rateMean(early),lateRate=rateMean(late);
      result.summary={
        workerMs:summarize(workers.map(s=>s.workerMs)),
        workerRoundTripMs:summarize(workers.map(s=>s.roundTripMs)),
        queueReadbackMs:summarize(workers.map(s=>s.queueReadbackMs)),
        paintMs:summarize(paints.map(s=>s.paintMs)),
        visualWorkMs:summarize(paints.map(s=>s.visualWorkMs)),
        paintIntervalMs:summarize(paints.map(s=>s.intervalMs).filter(v=>v!==null)),
        firstThirdFlowStepsPerSecond:earlyRate,lastThirdFlowStepsPerSecond:lateRate,
        throughputChangePercent:earlyRate>0&&lateRate!==null?(lateRate/earlyRate-1)*100:null,
        measuredWindowMs:windows.reduce((sum,w)=>sum+w.durationMs,0),
        foregroundRunningWindowMs:thirds.reduce((sum,w)=>sum+w.durationMs,0),
        eventCounts:run.events.reduce((counts,e)=>{counts[e.kind]=(counts[e.kind]||0)+1;return counts;},{})
      };
      const interruption=run.events.some(e=>
        ['settings_changed','flow_reset','fallback','engine_error','force_error','page_exit','invalid_timing_sample'].includes(e.kind)||
        (e.kind==='visibility'&&e.hidden)||
        (e.kind==='activity'&&(!e.running||e.hidden||e.interacting)));
      result.assessment={durationCompleted:run.status==='completed',
        uninterrupted:!interruption,samplesComplete:Object.values(run.dropped).every(n=>n===0),
        needsReview:interruption||Object.values(run.dropped).some(n=>n>0)||paints.length<10||
          run.events.some(e=>['paint_gap','worker_sample_gap'].includes(e.kind)),
        note:'Completed means the timer ended, not a certified stability PASS. P95 is nearest rank. Timings use browser wall clocks. Paint intervals include interruptions; review events. Early/late throughput excludes visibly interrupted or >2.5s rate windows. Device model is a user label, not detected hardware. No data is uploaded.'};
      return result;
    },
    progress(now){
      if(!run)return null;
      return {status:run.status,elapsedMs:active()?elapsed(now):run.elapsedMs,
        requestedDurationMs:run.requestedDurationMs,events:run.events.length,
        workers:run.workerSamples.length,paints:run.paintSamples.length};
    }
  };
}
