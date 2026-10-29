import {integer, buildList, shuffle, makeGroups} from './core.mjs';
const $ = id => document.getElementById(id);
let list = [], picked = new Set(), history = [], exportText = '';
function status() {
  const available = $('repeat').checked ? list.length : list.filter(x => !picked.has(x)).length;
  $('status').textContent = `${list.length} active · ${available} available for the next draw`;
}
function clearResults() {
  $('result').replaceChildren(); $('history').replaceChildren();
  exportText = ''; $('download').disabled = true;
}
function run(action) { try { $('error').textContent = ''; action(); } catch (e) { $('error').textContent = e.message; } }
function apply() {
  const next = buildList({mode: $('mode').value, from: $('from').value, to: $('to').value, names: $('names').value, exclude: $('exclude').value});
  list = next; picked = new Set(); history = []; clearResults(); status();
}
function show(rows, grouped) {
  $('result').replaceChildren();
  rows.forEach((row, i) => {
    const el = document.createElement('div'); el.className = grouped ? 'group' : 'winner';
    el.textContent = grouped ? `Group ${i + 1}: ${row.join(', ')}` : row.join(', ');
    $('result').append(el);
  });
  exportText = rows.map((r, i) => `${grouped ? `Group ${i + 1}` : 'Picked'}: ${r.join(', ')}`).join('\n');
  $('download').disabled = false;
}
$('mode').onchange = () => { $('numberFields').hidden = $('mode').value !== 'numbers'; $('nameFields').hidden = $('mode').value !== 'names'; };
$('apply').onclick = () => run(apply);
// Require applying edited settings before another draw, so exclusions cannot be missed.
for (const id of ['mode','from','to','names','exclude']) $(id).addEventListener('input', () => {
  $('pick').disabled = $('group').disabled = true;
  $('status').textContent = 'List changed. Click Apply list to continue.';
});
$('apply').addEventListener('click', () => { if (!$('error').textContent) $('pick').disabled = $('group').disabled = false; });
$('repeat').onchange = status;
$('pick').onclick = () => run(() => {
  const pool = $('repeat').checked ? list : list.filter(x => !picked.has(x));
  if (!pool.length) throw new Error('Everyone has been picked. Reset picks to start again.');
  const count = integer($('pickCount').value, 1, pool.length, 'Pick count');
  const result = shuffle(pool).slice(0, count);
  result.forEach(x => picked.add(x)); history.push(result);
  show([result], false);
  const item = document.createElement('li'); item.textContent = result.join(', '); $('history').prepend(item); status();
});
$('group').onclick = () => run(() => show(makeGroups(list, integer($('groupCount').value, 1, list.length, 'Group count')), true));
$('reset').onclick = () => { picked.clear(); history = []; clearResults(); if (!$('pick').disabled) status(); };
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([exportText], {type: 'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = 'classroom-results.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
run(apply);
