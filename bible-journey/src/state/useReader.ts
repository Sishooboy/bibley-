import { useContext } from 'react';
import { ReaderContext, type ReaderApi } from './readerContext';

export function useReader(): ReaderApi {
  const value = useContext(ReaderContext);
  if (!value) throw new Error('useReader must be used inside ReaderProvider');
  return value;
}
