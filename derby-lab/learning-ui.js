(()=>{
'use strict';
const $=id=>document.getElementById(id),find=s=>document.querySelector(s),main=find('main');
function drawer(title,nodes,parent){const d=document.createElement('details');d.className='learning-drawer';const s=document.createElement('summary');s.textContent=title;d.append(s);for(const n of nodes)if(n)d.append(n);parent.append(d);return d;}
find('h1').textContent='Build. Try. Discover!';find('.subtitle').textContent='Change one thing. Press play. See what happens.';find('.top-caption').textContent='YOUR LITTLE CAR LAB';find('.version').textContent='Explore & learn';
const chooser=document.createElement('nav');chooser.className='activity-picker';chooser.setAttribute('aria-label','Choose an activity');chooser.innerHTML='<button id="choose-race" type="button" aria-pressed="true" aria-controls="race-activity"><b>01 · Race Lab</b><span>What makes your car faster?</span></button><button id="choose-balance" type="button" aria-pressed="false" aria-controls="balance-activity"><b>02 · Balance Lab</b><span>Will both wheels stay on the track?</span></button>';
find('.heading').after(chooser);
const guide=document.createElement('p');guide.className='learning-guide';guide.setAttribute('role','status');guide.textContent='1. Change a slider   →   2. Start the race   →   3. Try another idea';chooser.after(guide);
const workspace=find('.workspace'),pitch=find('.pitch-panel'),fit=find('.fit-panel');workspace.id='race-activity';pitch.id='balance-activity';pitch.hidden=true;
const tuning=find('.tuning-panel'),basic=document.createElement('div');basic.className='learning-basics';find('.panel-header').after(basic);
const labels={mass:['Car weight','Light','Heavy'],wheels:['Wheel weight','Light','Heavy'],crr:['Rolling resistance','Smooth','Rough']};
for(const [key,[label,low,high]] of Object.entries(labels)){const row=$('range-'+key).closest('.parameter');basic.append(row);row.querySelector('label').textContent=label;$('range-'+key).setAttribute('aria-label',label);row.querySelector('.range-limits').innerHTML='<span>'+low+'</span><span>'+high+'</span>';}
const note=$('change-note');basic.after(note);const carExtras=drawer('More car settings',[find('.tabs'),$('controls-car'),$('controls-loss'),find('.search-box')],tuning);
// Reuse the original tilt inputs and handlers so saving, importing and both
// physics models continue to use the same single track-angle setting.
const tiltRow=$('range-tilt').closest('.parameter');
const trackSettings=drawer('Track settings',[tiltRow],tuning);trackSettings.id='track-settings';trackSettings.open=true;tuning.insertBefore(trackSettings,carExtras);
tiltRow.querySelector('label').textContent='Tilt the track';$('range-tilt').setAttribute('aria-label','Tilt the track');tiltRow.querySelector('.range-limits').innerHTML='<span>−10° · Lower finish</span><span>+10° · Higher finish</span>';
$('hint-tilt').textContent='Tilt the whole track around the starting line. 0° restores the original 3MF angle. Both labs use this angle.';
const trackActions=document.createElement('div');trackActions.className='track-actions';const trackReset=document.createElement('button');trackReset.id='track-reset';trackReset.className='button secondary';trackReset.type='button';trackReset.textContent='Reset track';const trackReadout=document.createElement('span');trackReadout.id='track-readout';trackReadout.setAttribute('role','status');trackReadout.setAttribute('aria-live','polite');trackActions.append(trackReset,trackReadout);trackSettings.append(trackActions);
const syncTrack=p=>{trackReadout.textContent=p.tilt===0?'Original track angle · 0°':`${p.tilt>0?'+':''}${p.tilt.toFixed(1)}° from the original track`;};syncTrack({tilt:Number($('range-tilt').value)});window.addEventListener('derby-setup-change',e=>syncTrack(e.detail.params));
trackReset.onclick=()=>{window.dispatchEvent(new Event('derby-activity-change'));$('range-tilt').value=DerbyPhysics.defaults.tilt;$('range-tilt').dispatchEvent(new Event('input',{bubbles:true}));};
$('tab-track').remove();const trackAdvanced=$('controls-track');trackAdvanced.hidden=false;trackAdvanced.removeAttribute('role');trackAdvanced.removeAttribute('aria-labelledby');drawer('Launch & landing · Advanced',[trackAdvanced],trackSettings);
const trackHelp=document.createElement('p');trackHelp.className='fit-help';trackHelp.textContent='Starting speed and restitution affect both labs. Landing speed retained applies only to Race Lab. Reset track changes only the angle.';trackAdvanced.append(trackHelp);
const simulation=find('.simulation');simulation.append(find('.feedback'));const telemetry=drawer('Why did this happen?',[find('.chart-card'),find('.events-panel')],simulation);
telemetry.append(find('.feedback'));
fit.querySelector('.fit-intro').textContent='Check the body and wheels against the original track. These dimensions also change the Balance Lab experiment.';
const energy=find('.energy-panel');energy.querySelector('h2').textContent='Watch the energy change';energy.querySelector('.energy-intro').textContent='Blue is height. Green is motion. Orange is energy lost.';
for(const [cls,label] of [['energy-potential','Height energy'],['energy-kinetic','Motion energy'],['energy-loss','Energy lost']])find('.'+cls+' h3').textContent=label;
drawer('Energy numbers & explanation',[find('.energy-breakdown'),$('energy-balance'),find('.energy-details')],energy);
const files=drawer('Save, share & compare',[find('.setup-tools'),$('comparison')],main);files.id='learning-files';$('search').addEventListener('click',()=>files.open=true);files.querySelector('.tool-actions').append($('save'));files.querySelectorAll('a[href="#fit-heading"],a[href="#pitch-heading"]').forEach(a=>a.remove());
const fitDrawer=drawer('Will the chassis fit? · All dimensions',[fit],pitch);fitDrawer.id='learning-fit';
const wb=$('fit-wheelbase').parentElement;wb.classList.add('pitch-field');$('pitch-controls').prepend(wb);
const cg=$('pitch-cg').parentElement;cg.firstChild.textContent='Balance point · back 20% ↔ front 80%';const cgSlider=document.createElement('input');cgSlider.type='range';cgSlider.min=20;cgSlider.max=80;cgSlider.step=1;cgSlider.value=$('pitch-cg').value;cgSlider.setAttribute('aria-label','Balance point');cg.append(cgSlider);cgSlider.oninput=()=>{$('pitch-cg').value=cgSlider.value;$('pitch-cg').dispatchEvent(new Event('input',{bubbles:true}));};$('pitch-cg').addEventListener('input',()=>cgSlider.value=$('pitch-cg').value);$('pitch-reset').addEventListener('click',()=>cgSlider.value=$('pitch-cg').value);
const wbSlider=document.createElement('input');Object.assign(wbSlider,{type:'range',min:85,max:100,step:1,value:$('fit-wheelbase').value});wbSlider.setAttribute('aria-label','Axle spacing');wb.append(wbSlider);wbSlider.oninput=()=>{$('fit-wheelbase').value=wbSlider.value;$('fit-wheelbase').dispatchEvent(new Event('input',{bubbles:true}));};window.addEventListener('derby-fit-change',()=>wbSlider.value=$('fit-wheelbase').value);
$('pitch-height').parentElement.firstChild.textContent='Balance point height (mm)';
const advanced=drawer('Explore the forces & energy',[ $('pitch-gyration').parentElement,find('.pitch-telemetry'),$('pitch-inputs')],pitch);
// Move the detailed energy/event blocks as a contiguous group, preserving all IDs.
let n=pitch.querySelector('h3');while(n&&n!==fitDrawer&&n!==advanced){const next=n.nextElementSibling;advanced.append(n);n=next;}
pitch.insertBefore(advanced,fitDrawer);pitch.querySelector('h2').textContent='Keep your car balanced';pitch.querySelector('.fit-intro').textContent='Move the balance point or change the axle spacing. Watch which wheels lift. This experiment stops if the car body touches the track.';
const caution=document.createElement('p');caution.className='learning-caution';caution.textContent='A model to explore, not a real-car prediction. Balance Lab uses different physics and timing from Race Lab.';pitch.querySelector('.fit-intro').after(caution);
const contact=$('pitch-contact').parentElement;contact.className='learning-contact';pitch.querySelector('.pitch-layout').before(contact);
const shared=document.createElement('button');shared.className='button secondary';shared.textContent='Change weight & wheels in Race Lab';shared.onclick=()=>select('race');pitch.querySelector('.tool-actions').append(shared);
function select(mode){window.dispatchEvent(new Event('derby-activity-change'));const race=mode==='race';workspace.hidden=!race;pitch.hidden=race;files.hidden=!race;if(race)tuning.insertBefore(trackSettings,carExtras);else pitch.insertBefore(trackSettings,$('pitch-controls'));$('choose-race').setAttribute('aria-pressed',race);$('choose-balance').setAttribute('aria-pressed',!race);guide.textContent=race?'1. Change a slider   →   2. Start the race   →   3. Try another idea':'1. Move the balance point   →   2. Play   →   3. Watch the wheels';}
$('choose-race').onclick=()=>select('race');$('choose-balance').onclick=()=>select('balance');
// Existing deep links still reveal their destination.
function reveal(){if(location.hash==='#pitch-heading')select('balance');if(location.hash==='#fit-heading'){select('balance');fitDrawer.open=true;}}
window.addEventListener('hashchange',reveal);reveal();
main.insertBefore(files,find('.model-notes'));find('.model-notes').querySelector('summary').firstChild.textContent='For grown-ups: model & limitations ';
})();
