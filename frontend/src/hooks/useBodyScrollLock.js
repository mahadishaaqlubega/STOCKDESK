import { useEffect } from 'react';

export default function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return undefined;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = original;
    };
  }, [isLocked]);
}
