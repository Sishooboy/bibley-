import { useContext } from 'react';
import { CloudContext, type Cloud } from './cloudContext';

export function useCloud(): Cloud {
  const cloud = useContext(CloudContext);
  if (!cloud) throw new Error('useCloud must be used inside <CloudProvider>');
  return cloud;
}
