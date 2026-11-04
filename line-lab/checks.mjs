import assert from 'node:assert/strict';
import {Simulation,trailOpacity,DT} from './engine.js?v=5';
import {Evolution,GENES,evaluateGenome,GA_DEFAULTS} from './genetics.js?v=5';
assert.equal(trailOpacity(0,1000),1);assert.equal(trailOpacity(750,1000),1);assert.equal(trailOpacity(875,1000),.5);assert.equal(trailOpacity(1000,1000),0);assert.equal(trailOpacity(2000,1000),0);
let previousAlpha=1;for(let d=0;d<=1100;d++){const alpha=trailOpacity(d,1000);assert(alpha<=previousAlpha);assert(alpha>=0&&alpha<=1);previousAlpha=alpha;}
for(const base of [35,80]){const sim=new Simulation({track:'loop',base});for(let j=0;j<Math.round(28/DT);j++)sim.tick();assert(sim.laps>=2);assert(sim.trail[0].distance>0);assert(sim.distance-sim.trail[1].distance<sim.loopLength);assert.equal(trailOpacity(sim.distance-sim.trail.at(-1).distance,sim.loopLength),1);}
const evo=new Evolution();let previous=null;const best=[];
for(let generation=0;generation<12;generation++){
 const result=evo.step();assert.equal(result.population.length,12);assert(result.best.score>=0&&result.best.score<=100);if(previous)assert(result.best.score>=previous.best.score-1e-9,'Elitism preserves the best');best.push(result.best.score);
 for(const candidate of result.population){
  for(const gene of GENES){const v=candidate.genome[gene.key];assert(v>=gene.min&&v<=gene.max);if(candidate.origin==='child'){const source=previous.population.find(p=>p.id===candidate.sources[gene.key]);assert(source);const mutation=candidate.mutations.find(m=>m.gene===gene.key);if(mutation){assert.equal(mutation.before,source.genome[gene.key]);assert.equal(mutation.after,v);}else assert.equal(v,source.genome[gene.key]);}}
  assert(Math.abs(candidate.score-Object.values(candidate.parts).reduce((a,b)=>a+b,0))<1e-8);assert(candidate.route.length>1);assert(candidate.route.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert(candidate.route.at(-1).t<=12.001);
  if(candidate.origin==='elite'){const parent=previous.population.find(p=>p.id===candidate.parents[0]);assert.deepEqual(candidate.genome,parent.genome);assert.equal(candidate.score,parent.score);}
 }
 previous=result;
}
assert(best.at(-1)>best[0],'Seed 42 search should improve over its starting best');
const repeat=new Evolution();const first=repeat.step();assert.equal(first.best.score,best[0]);
const noMutation=new Evolution({mutation:0});noMutation.step();const second=noMutation.step();assert(second.population.every(p=>p.mutations.length===0));
const fullMutation=new Evolution({mutation:1,population:8});fullMutation.step();const full=fullMutation.step();assert(full.population.some(p=>p.mutations.length>0));for(const p of full.population)for(const g of GENES)assert(p.genome[g.key]>=g.min&&p.genome[g.key]<=g.max);
const bad=evaluateGenome({kp:55,ki:0,kd:0},GA_DEFAULTS);assert(first.best.score>bad.score);assert(first.best.seen>bad.seen);
console.log(JSON.stringify({passed:true,trail:'Distance-based smooth fade and pruning, at two speeds',genetic:'12 generations; genuine fitness, ancestry, crossover, mutation bounds, elites, deterministic seeds',fitness:{initial:best[0],after12:best.at(-1),poorController:bad.score}},null,2));
// Inspecting a prepared generation must neither consume more randomness nor change its test.
for(const mutation of [0,.2,1]){
 const guided=new Evolution({mutation,population:8}),automatic=new Evolution({mutation,population:8});
 for(let generation=1;generation<=3;generation++){
  const preview=structuredClone(guided.prepare());assert.deepEqual(guided.prepare(),preview);assert.equal(guided.generation,generation-1);
  const tested=guided.step(),direct=automatic.step();assert.deepEqual(tested,direct);
  for(const child of preview){const actual=tested.population.find(p=>p.id===child.id);assert.deepEqual(actual.genome,child.genome);assert.deepEqual(actual.mutations,child.mutations);}
 }
}
console.log('Guided previews and automatic evolution produce identical tested populations at 0%, 20%, and 100% mutation.');
// Transfer tests use locked gene copies and cannot alter evolution or its random stream.
const {testLockedPair,replayPose}=await import('./comparison-core.js?v=5');
const compareEvolution=new Evolution(),compareControl=new Evolution();const firstBest=structuredClone(compareEvolution.step().best);compareControl.step();let later;
for(let n=0;n<4;n++){later=compareEvolution.step();compareControl.step();}
const locked={generation:later.generation,config:{...later.config},robots:[firstBest,structuredClone(later.best)]},unchanged=structuredClone(locked);
for(const track of ['curves','loop','tight']){
 const tested=testLockedPair(locked,track);assert.deepEqual(locked,unchanged);assert.equal(tested.base,locked.config.base);assert.equal(tested.bias,locked.config.bias);
 for(let i=0;i<2;i++){
  assert.deepEqual(tested.robots[i].genome,locked.robots[i].genome);
  const direct=evaluateGenome(locked.robots[i].genome,{...locked.config,track});assert.deepEqual(tested.robots[i].route,direct.route);assert.equal(tested.robots[i].score,direct.score);
  if(track==='curves')assert.equal(tested.robots[i].score,locked.robots[i].score);
  const route=tested.robots[i].route,start=replayPose(route,0),end=replayPose(route,99);assert.equal(start.x,route[0].x);assert.equal(end.x,route.at(-1).x);assert.equal(end.distance,route.at(-1).distance);
 }
}
assert.deepEqual(compareEvolution.step(),compareControl.step(),'Challenge tests must not train or advance the search');
const same=testLockedPair({...locked,robots:[firstBest,firstBest]},'tight');assert.deepEqual(same.robots[0],same.robots[1]);
const route=[{t:0,x:0,y:0,angle:0,distance:0},{t:1,x:10,y:20,angle:2,distance:30}];assert.deepEqual(replayPose(route,.5),{i:0,x:5,y:10,angle:1,distance:15});
console.log('Comparison checks passed: identical training replays; locked genes on all three tracks; no retraining; shared-time interpolation and end-position hold.');
