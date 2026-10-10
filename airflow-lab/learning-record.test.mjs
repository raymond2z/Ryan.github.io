import test from 'node:test';
import assert from 'node:assert/strict';
import {learningChecks,makeLearningRecord} from './learning-record.mjs';

const view={shape:'block',image:'data:image/png;base64,dGVzdA==',speed:.085,viscosity:.025,angle:0,steps:2000,view:'speed',sizeMode:'matched-height',obstacleHeight:31,position:{x:72,y:52},engine:'wasm',grid:{width:240,height:104},geometryScale:1,note:'A wide wake'};
const record={records:[view,{...view,shape:'streamlined',note:'B short wake'}],title:'Compare two shapes',prediction:"I'm not sure yet",conclusion:'I need more testing because the colours are hard to compare.',fairReviewed:true,differences:[]};

test('uncertain ideas count as written evidence without grading or requiring a particular answer',()=>{
  assert.ok(learningChecks(record).every(c=>c.done));
  assert.equal(learningChecks({...record,conclusion:'   '}).find(c=>c.key==='explanation').done,false);
  assert.equal(learningChecks({...record,records:[view,{...view,note:'\n '}]}).find(c=>c.key==='observations').done,false);
  assert.equal(learningChecks({...record,fairReviewed:false}).find(c=>c.key==='conditions').done,false);
  assert.equal(learningChecks({...record,records:[view]}).find(c=>c.key==='views').done,false);
});

test('repeat evidence accepts uncertainty but only checks repeat answers for a completed repeated pair',()=>{
  const repeated={...record,records:record.records.map(r=>({...r,comparison:{round:2,repeated:true}}))};
  for(const result of ['similar','different','unsure'])assert.equal(learningChecks({...repeated,repeatResult:result}).at(-1).done,true);
  for(const result of ['', 'toString'])assert.equal(learningChecks({...repeated,repeatResult:result}).at(-1).done,false);
  assert.equal(learningChecks(record).length,5);
});

test('download keeps full writing, pictures and visible condition differences, even for unfinished work',()=>{
  const longText='Full observation with evidence. '.repeat(500)+'\nLAST LINE';
  const html=makeLearningRecord({...record,records:[{...view,note:longText},view],conclusion:'',differences:['wind speed','elapsed steps']},{block:'Block',speed:'Speed'});
  assert.ok(html.includes(longText));assert.ok(html.includes('data:image/png;base64,dGVzdA=='));
  assert.ok(html.includes('Review differences: wind speed, elapsed steps'));
  assert.ok(html.includes('Student marked settings reviewed.'));
  assert.ok(html.includes('Not recorded'));assert.ok(html.includes('To add · Explanation recorded'));
  assert.throws(()=>makeLearningRecord({...record,records:[view]}));
});

test('user writing and metadata cannot become markup, script or a remote image in the downloaded record',()=>{
  const payload='<script>alert("student")</script><img src=x onerror=alert(1)>';
  const html=makeLearningRecord({...record,title:payload,prediction:payload,conclusion:payload,differences:[payload],records:[{...view,note:payload,image:'https://example.test/tracker.png',engine:payload},view]},{block:payload});
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('https://example.test'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;student&quot;)'));
  assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes("default-src 'none'"));
});

test('a repeated record includes the previous full evidence with its original review state',()=>{
  const html=makeLearningRecord({...record,conclusion:'CURRENT-CONCLUSION',records:record.records.map(r=>({...r,comparison:{round:2,repeated:true}})),repeatResult:'different',previous:{...record,conclusion:'PREVIOUS-CONCLUSION',fairReviewed:false}});
  assert.ok(html.includes('CURRENT-CONCLUSION'));assert.ok(html.includes('PREVIOUS-CONCLUSION'));
  assert.ok(html.includes('The wake looked different'));assert.ok(html.includes('Previous test · my earlier evidence'));
  assert.ok(html.includes('Student has not marked settings reviewed.'));
});
