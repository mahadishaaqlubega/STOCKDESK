import { useEffect } from 'react';

// Locks are counted so overlapping ones (a page lock plus a ConfirmDialog's
// own) can close in any order. Each saving and restoring the overflow it saw
// left the page stuck on 'hidden' with no scrolling until a reload.
let locks = 0;
let original = '';

export default function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return undefined;

    if (locks === 0) {
      original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = original;
    };
  }, [isLocked]);
}
