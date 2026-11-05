import {Evolution,randomGenome,seededRandom,evaluateGenome,GA_DEFAULTS} from './genetics.js?v=6';
// Same 240 simulation evaluations per method, same first population and uniform gene bounds.
const rows=[];
for(const seed of [1,7,42,99,2026]){
 const evo=new Evolution({seed});const first=evo.step();let last=first;for(let i=1;i<20;i++)last=evo.step();
 const random=seededRandom(seed);let randomBest=null;for(let i=0;i<240;i++){const genome=randomGenome(random),result=evaluateGenome(genome,{...GA_DEFAULTS,seed});if(!randomBest||result.score>randomBest.score)randomBest=result;}
 rows.push({seed,evaluations:240,firstLap:+first.best.lapTime.toFixed(2),evolvedLap:+last.best.lapTime.toFixed(2),randomBestLap:+randomBest.lapTime.toFixed(2),firstFinishers:first.history[0].completed,lastFinishers:last.history.at(-1).completed});
}
console.log(JSON.stringify(rows,null,2));
