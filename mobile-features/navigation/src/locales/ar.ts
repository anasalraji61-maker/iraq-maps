import type { ManeuverType } from '@iraq-maps/contracts';

function fmtDist(distM: number): string {
  return distM < 1000 ? `${Math.round(distM)} م` : `${Math.round(distM / 100) / 10} كم`;
}

export const ar: Record<ManeuverType, (street: string, distM: number) => string> = {
  depart: (s, d) => `ابدأ بالتحرك ${fmtDist(d)} على ${s || 'الطريق'}`,
  arrive: (_s, _d) => 'وصلت إلى وجهتك',
  continue: (s, d) => `استمر ${fmtDist(d)} على ${s || 'الطريق'}`,
  turn: (s, _d) => `انعطف نحو ${s || 'الشارع'}`,
  uturn: (s, _d) => `نفّذ دوران كامل نحو ${s || 'الطريق'}`,
  ramp: (s, _d) => `اتجه إلى المنحدر نحو ${s || 'الطريق'}`,
  exit: (s, _d) => `اخرج من الطريق نحو ${s || 'الشارع'}`,
  fork: (s, _d) => `خذ التفرع نحو ${s || 'الطريق'}`,
  merge: (s, _d) => `ادمج مع ${s || 'الطريق'}`,
  roundabout_enter: (s, _d) => `ادخل الدوار واخرج نحو ${s || 'الشارع'}`,
  roundabout_exit: (s, _d) => `اخرج من الدوار نحو ${s || 'الشارع'}`,
  ferry_enter: (s, _d) => `استقل العبّارة نحو ${s || 'الوجهة'}`,
  ferry_exit: (s, _d) => `انزل من العبّارة نحو ${s || 'الشارع'}`,
};
