import {FluidSimulation} from './simulation.mjs';

export const COMPARISON_STEPS=2000;

// Use the existing preset geometry. Choose one position that fits BOTH masks,
// even when a student starts with an obstacle close to an edge.
export function comparisonPlan(settings){
  const preview=new FluidSimulation(settings.grid.width,settings.grid.height);
  const extents=['block','streamlined'].map(shape=>{
    preview.setShape(shape,0);
    const b=preview.obstacleBounds();
    return {left:preview.centerX-b.minX,right:b.maxX-preview.centerX,
      top:preview.centerY-b.minY,bottom:b.maxY-preview.centerY};
  });
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Math.round(v)));
  return {...structuredClone(settings),angle:0,targetSteps:COMPARISON_STEPS,
    position:{
      x:clamp(settings.position.x,8+Math.max(...extents.map(b=>b.left)),preview.width-9-Math.max(...extents.map(b=>b.right))),
      y:clamp(settings.position.y,8+Math.max(...extents.map(b=>b.top)),preview.height-9-Math.max(...extents.map(b=>b.bottom)))
    }};
}

export function comparisonDifferences(a,b){
  const differences=[];
  const variable=a.experiment==='speed'?'speed':a.experiment==='angle'?'angle':'shape';
  for(const [key,label]of [['speed','wind speed'],['viscosity','viscosity'],['angle','angle'],
    ['steps','elapsed steps'],['view','colour view'],['engine','engine'],['shapeScale','preset scale'],
    ['animation','animation pace'],['batchMode','workload'],['particles','particles'],['vectors','arrows'],['forceEnabled','force setting']]){
    if(key!==variable&&a[key]!==b[key])differences.push(label);
  }
  if(a.experiment!==b.experiment)differences.push('different questions');
  if(a.position?.x!==b.position?.x||a.position?.y!==b.position?.y)differences.push('object position');
  if(a.grid?.width!==b.grid?.width||a.grid?.height!==b.grid?.height)differences.push('grid');
  if(Math.abs(a.inletSpeed-a.speed)>.0003||Math.abs(b.inletSpeed-b.speed)>.0003)differences.push('flow still adjusting');
  if(a[variable]===b[variable])differences.push(`same ${variable} in both views`);
  if(variable!=='shape'&&a.shape!==b.shape)differences.push('shape');
  if(variable!=='angle'&&a.obstacleHeight&&b.obstacleHeight&&Math.abs(a.obstacleHeight-b.obstacleHeight)>1)differences.push('front-facing height');
  return differences;
}

export function createMatchedComparison(){
  let phase='idle',plan=null;
  return {
    get active(){return ['running-a','ready-b','running-b'].includes(phase);},
    get running(){return ['running-a','running-b'].includes(phase);},
    get phase(){return phase;},
    get plan(){return plan?structuredClone(plan):null;},
    get shape(){return phase==='running-b'?'streamlined':'block';},
    start(settings){if(this.active)throw new Error('A comparison is already active.');plan=comparisonPlan(settings);phase='running-a';return this.plan;},
    remaining(time){return this.running?Math.max(0,plan.targetSteps-time):Infinity;},
    limit(count,time){return Math.min(count,this.remaining(time));},
    complete(time){
      if(!this.running)return false;
      if(time<plan.targetSteps)return false;
      if(time!==plan.targetSteps){phase='failed';throw new Error('The observation point was missed. Start a fresh comparison.');}
      phase=phase==='running-a'?'ready-b':'done';return true;
    },
    next(){if(phase!=='ready-b')throw new Error('Capture A before starting B.');phase='running-b';},
    cancel(){phase='cancelled';}
  };
}

export function seededRandom(seed=42){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
