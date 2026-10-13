import type { ManeuverType } from '@iraq-maps/contracts';

function fmtDist(distM: number): string {
  return distM < 1000 ? `${Math.round(distM)} m` : `${Math.round(distM / 100) / 10} km`;
}

export const en: Record<ManeuverType, (street: string, distM: number) => string> = {
  depart: (s, d) => `Head ${fmtDist(d)} on ${s || 'the road'}`,
  arrive: (_s, _d) => 'You have arrived at your destination',
  continue: (s, d) => `Continue ${fmtDist(d)} on ${s || 'the road'}`,
  turn: (s, _d) => `Turn onto ${s || 'the street'}`,
  uturn: (s, _d) => `Make a U-turn onto ${s || 'the road'}`,
  ramp: (s, _d) => `Take the ramp onto ${s || 'the road'}`,
  exit: (s, _d) => `Take the exit onto ${s || 'the street'}`,
  fork: (s, _d) => `Keep on the fork toward ${s || 'the road'}`,
  merge: (s, _d) => `Merge onto ${s || 'the road'}`,
  roundabout_enter: (s, _d) => `Enter the roundabout and exit onto ${s || 'the street'}`,
  roundabout_exit: (s, _d) => `Exit the roundabout onto ${s || 'the street'}`,
  ferry_enter: (s, _d) => `Take the ferry toward ${s || 'the destination'}`,
  ferry_exit: (s, _d) => `Leave the ferry onto ${s || 'the street'}`,
};
