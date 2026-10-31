import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import useBodyScrollLock from '../useBodyScrollLock';

function Dialog() {
  useBodyScrollLock(true);
  return null;
}

// Same shape as Products/Users/Expenses: the page locks while deleteTarget is
// set and also renders a ConfirmDialog, which takes its own lock.
function Page({ deleteTarget }) {
  useBodyScrollLock(Boolean(deleteTarget));
  return deleteTarget ? <Dialog /> : null;
}

describe('useBodyScrollLock', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('locks and unlocks the page', () => {
    const { rerender } = render(<Page deleteTarget={null} />);
    expect(document.body.style.overflow).toBe('');
    rerender(<Page deleteTarget={{ id: 1 }} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Page deleteTarget={null} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks after a page lock and a dialog lock close together', () => {
    const { rerender } = render(<Page deleteTarget={{ id: 1 }} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Page deleteTarget={null} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('stays locked until the last lock goes', () => {
    const { rerender } = render(<><Page deleteTarget={{ id: 1 }} /><Dialog /></>);
    rerender(<><Page deleteTarget={null} /><Dialog /></>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<><Page deleteTarget={null} /></>);
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks when the page is left with a dialog still open', () => {
    const { unmount } = render(<Page deleteTarget={{ id: 1 }} />);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
