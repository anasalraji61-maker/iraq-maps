import { satelliteTestIDs } from '@iraq-maps/contracts';
import { IconButton } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { t } from '../strings';

export interface SatelliteToggleProps {
  active: boolean;
  onToggle: () => void;
}

/** Toggles between street and satellite base layers. */
export function SatelliteToggle({ active, onToggle }: SatelliteToggleProps): ReactElement {
  return (
    <IconButton
      testID={satelliteTestIDs.toggle}
      icon={active ? 'map' : 'satellite'}
      accessibilityLabel={t('satellite.label')}
      onPress={onToggle}
    />
  );
}
