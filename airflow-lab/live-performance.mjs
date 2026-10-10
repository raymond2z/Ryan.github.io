// Stage 3.3: bounded, device-adaptive WebGPU batch size.
// GPU timings are CPU wall clocks (shader encoding + submit + mapAsync), not GPU timestamps.
export const STEP_MIN=4;
export const STEP_MAX=24;
export const STEP_FIXED=8;
export const MAX_TRACER_DEBT=96;
export const RENDER_INTERVAL_MS=1000/30;

export function makeAdaptiveStepper({initial=STEP_FIXED,targetMs=30,min=STEP_MIN,max=STEP_MAX}={}){
  let batch=Math.max(min,Math.min(max,initial));
  let smoothedMs=null;
  let samples=0;
  return {
    get batch(){return batch;},
    get smoothedMs(){return smoothedMs;},
    reset(){batch=Math.max(min,Math.min(max,initial));smoothedMs=null;samples=0;},
    observe({steps,workerMs}){
      if(!(steps>0&&Number.isFinite(workerMs)&&workerMs>0))return batch;
      // Normalized time estimate for the full batch, not just the last message's step count.
      // This is a time budget, not a promise of a particular canvas FPS.
      const estimate=workerMs*batch/steps;
      smoothedMs=smoothedMs===null?estimate:.7*smoothedMs+.3*estimate;
      samples++;
      if(samples%3!==0)return batch;
      if(smoothedMs<targetMs*.82)batch=Math.min(max,batch+2);
      else if(smoothedMs>targetMs*1.18)batch=Math.max(min,batch-2);
      return batch;
    }
  };
}
export function shouldDrawGpuFrame({now,lastPaint,fluidDirty,tracerDebt,running,particlesEnabled}){
  if(now-lastPaint<RENDER_INTERVAL_MS)return false;
  return Boolean(fluidDirty||(running&&particlesEnabled&&tracerDebt>=.5));
}
// RequestAnimationFrame times are quantized to display refreshes.
// A naive >= 1000/30 test can miss the second 60 Hz refresh by a fraction
// of a millisecond, slipping to the third refresh (~20 FPS).
// Track absolute paint deadlines; a 1.5 ms alignment margin avoids a
// one-refresh penalty without accumulating one frame's lateness into the next.
export const FRAME_ALIGNMENT_MARGIN_MS=1.5;
export function createGpuPaintPacer({
  intervalMs=RENDER_INTERVAL_MS,alignmentMs=FRAME_ALIGNMENT_MARGIN_MS
}={}){
  if(!(Number.isFinite(intervalMs)&&intervalMs>0&&Number.isFinite(alignmentMs)&&alignmentMs>=0))
    throw Error('Invalid GPU paint interval');
  let nextDue=null;
  return {
    reset(){nextDue=null;},
    get nextDue(){return nextDue;},
    shouldDraw({now,fluidDirty,tracerDebt,running,particlesEnabled}){
      if(!Number.isFinite(now))return false;
      const changes=Boolean(fluidDirty||(running&&particlesEnabled&&tracerDebt>=.5));
      if(!changes)return false;
      if(nextDue===null){nextDue=now+intervalMs;return true;}
      if(now+alignmentMs<nextDue)return false;
      // Advance fixed deadlines rather than using actual paint completion,
      // so a late callback cannot make every subsequent frame late.
      const missed=Math.max(1,Math.floor((now+alignmentMs-nextDue)/intervalMs)+1);
      nextDue+=missed*intervalMs;
      return true;
    }
  };
}

export function forceFrameTiming(value){
  return Number.isFinite(value)&&value>=0?Math.round(value*10)/10:null;
}
