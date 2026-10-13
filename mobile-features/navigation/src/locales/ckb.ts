import type { ManeuverType } from '@iraq-maps/contracts';

function fmtDist(distM: number): string {
  return distM < 1000 ? `${Math.round(distM)} م` : `${Math.round(distM / 100) / 10} کم`;
}

export const ckb: Record<ManeuverType, (street: string, distM: number) => string> = {
  depart: (s, d) => `بەرەو ${s || 'ڕێگا'} بچۆ ${fmtDist(d)}`,
  arrive: (_s, _d) => 'گەیشتیت بۆ مەبەستت',
  continue: (s, d) => `بەردەوام بە ${fmtDist(d)} لەسەر ${s || 'ڕێگا'}`,
  turn: (s, _d) => `بۆ ${s || 'کوچە'} بگەڕێ`,
  uturn: (s, _d) => `گەڕانەوەی تەواو بەرەو ${s || 'ڕێگا'}`,
  ramp: (s, _d) => `بچۆ سەر ئاستبەندەکە بەرەو ${s || 'ڕێگا'}`,
  exit: (s, _d) => `دەرچو بەرەو ${s || 'کوچە'}`,
  fork: (s, _d) => `لانەکەی بەرەو ${s || 'ڕێگا'} بگرە`,
  merge: (s, _d) => `تێکەڵ بە ${s || 'ڕێگا'}`,
  roundabout_enter: (s, _d) => `بچۆ ناو گەردونەکە و دەرچو بەرەو ${s || 'کوچە'}`,
  roundabout_exit: (s, _d) => `لە گەردونەکە دەرچو بەرەو ${s || 'کوچە'}`,
  ferry_enter: (s, _d) => `سوارە قەیقەکە ببە بەرەو ${s || 'مەبەست'}`,
  ferry_exit: (s, _d) => `لە قەیقەکە دابەزە بەرەو ${s || 'کوچە'}`,
};
