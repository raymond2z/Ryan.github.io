export function integer(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
export function buildList({mode, from, to, names, exclude}) {
  let list;
  if (mode === 'numbers') {
    const start = integer(from, 1, 1000, 'From');
    const end = integer(to, start, 1000, 'To');
    list = Array.from({length: end - start + 1}, (_, i) => String(start + i));
  } else {
    list = [...new Set(names.split('\n').map(s => s.trim()).filter(Boolean))];
    if (list.length > 1000) throw new Error('Use at most 1000 entries.');
  }
  const excluded = new Set(exclude.split(/[,\n]/).map(s => s.trim()).filter(Boolean));
  list = list.filter(s => !excluded.has(s));
  if (!list.length) throw new Error('Add at least one entry that is not excluded.');
  return list;
}
function randomIndex(max) {
  const range = 2 ** 32;
  const limit = range - range % max;
  const data = new Uint32Array(1);
  do { crypto.getRandomValues(data); } while (data[0] >= limit);
  return data[0] % max;
}
export function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeGroups(list, count) {
  integer(count, 1, list.length, 'Group count');
  const groups = Array.from({length: count}, () => []);
  shuffle(list).forEach((item, i) => groups[i % count].push(item));
  return groups;
}
