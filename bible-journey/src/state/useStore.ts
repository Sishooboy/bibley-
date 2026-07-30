import { useContext } from 'react';
import { StoreContext, type Store } from './context';

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
