import {evaluateGenome,TEST_SECONDS} from './genetics.js?v=6';
import {clamp} from './engine.js?v=6';
export const TRACK_NAMES={loop:'Practice loop',curves:'S-curves',tight:'Tight turns'};
// Evaluate copies, never the evolution population. Only the track may change.
export function testLockedPair(snapshot,track){
 if(!Object.hasOwn(TRACK_NAMES,track))throw new Error('Choose a valid test track.');
 const config={...snapshot.config,track};
 const robots=snapshot.robots.map(robot=>({id:robot.id,genome:{...robot.genome},trainingScore:robot.score,...evaluateGenome({...robot.genome},config)}));
 return {generation:snapshot.generation,trainingTrack:snapshot.config.track,track,base:config.base,bias:config.bias,robots,duration:TEST_SECONDS};
}
export function replayPose(route,time){
 let i=0;while(i+1<route.length&&route[i+1].t<=time)i++;
 const a=route[i],b=route[Math.min(i+1,route.length-1)],f=b.t>a.t?clamp((time-a.t)/(b.t-a.t),0,1):0;
 return {i,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,angle:a.angle+(b.angle-a.angle)*f,distance:a.distance+(b.distance-a.distance)*f};
}

