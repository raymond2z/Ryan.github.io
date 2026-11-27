(function (global) {
'use strict';
const original = global.DERBY_TRACK;
const originalFit = global.DERBY_FIT_DATA;
const [startX, startHeight] = original.points[0];
const [endX, endHeight] = original.points.at(-1);
const heightAt = x => {
  const fraction = (x - startX) / (endX - startX);
  return startHeight * (1 - fraction) + endHeight * fraction;
};
const [, roadEnd, guideEnd] = originalFit.points.at(-1);
const straight = {points: original.points.map(([x]) => [x, heightAt(x)]), cuts: []};
const straightFit = {...originalFit, source: 'Ideal straight slope', points: originalFit.points.map(([x]) => {
  const height = heightAt(x / 1000) * 1000;
  return [x, height, height + guideEnd - roadEnd];
})};
const key = id => id === 'straight' ? 'straight' : 'original';
global.DerbyTracks = {
  key,
  label: id => key(id) === 'straight' ? 'Straight slope' : 'Original track',
  race: id => key(id) === 'straight' ? straight : original,
  fit: id => key(id) === 'straight' ? straightFit : originalFit
};
})(window);
