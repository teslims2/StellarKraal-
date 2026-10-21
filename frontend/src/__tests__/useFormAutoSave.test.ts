import { renderHook, act } from '@testing-library/react';
import { useFormAutoSave } from '@/hooks/useFormAutoSave';

describe('useFormAutoSave', () => {
  const storageKey = 'test_form';
  const walletAddress = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

  beforeEach(() => {
    sessionStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-saves data after interval', () => {
    renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: 'value1', field2: 'value2' },
        walletAddress,
        interval: 5000,
      })
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const saved = sessionStorage.getItem(storageKey);
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved!);
    expect(parsed.data.field1).toBe('value1');
    // walletAddress must NOT be stored in the saved draft
    expect(parsed.walletAddress).toBeUndefined();
  });

  it('stores expiresAt as a Unix ms timestamp', () => {
    const now = Date.now();
    renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: 'value1' },
        interval: 5000,
        expiryMs: 3_600_000,
      })
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const saved = sessionStorage.getItem(storageKey);
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved!);
    // expiresAt should be roughly now + 1 hour
    expect(typeof parsed.expiresAt).toBe('number');
    expect(parsed.expiresAt).toBeGreaterThanOrEqual(now + 3_600_000 - 100);
    // timestamp field must not exist (old shape)
    expect(parsed.timestamp).toBeUndefined();
  });

  it('does not save empty data', () => {
    renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: '', field2: '' },
        walletAddress,
      })
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('detects existing saved data on mount', () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        data: { field1: 'saved' },
        expiresAt: Date.now() + 3_600_000,
      })
    );

    const { result } = renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: '' },
        walletAddress,
      })
    );

    expect(result.current.hasSavedData).toBe(true);
  });

  it('restores saved data', () => {
    const savedData = { field1: 'restored', field2: 'data' };
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        data: savedData,
        expiresAt: Date.now() + 3_600_000,
      })
    );

    const { result } = renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: '', field2: '' },
        walletAddress,
      })
    );

    let restored: typeof savedData | null = null;
    act(() => {
      restored = result.current.restoreSavedData();
    });
    expect(restored).toEqual(savedData);
    expect(result.current.hasSavedData).toBe(false);
  });

  it('clears saved data', () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        data: { field1: 'value' },
        expiresAt: Date.now() + 3_600_000,
      })
    );

    const { result } = renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: 'value' },
        walletAddress,
      })
    );

    act(() => {
      result.current.clearSavedData();
    });

    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(result.current.hasSavedData).toBe(false);
  });

  it('updates lastSaved timestamp', () => {
    const { result } = renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: 'value' },
        walletAddress,
        interval: 5000,
      })
    );

    expect(result.current.lastSaved).toBeNull();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.lastSaved).toBeInstanceOf(Date);
  });

  it('respects enabled flag', () => {
    renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: 'value' },
        walletAddress,
        enabled: false,
      })
    );

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('handles invalid JSON gracefully', () => {
    sessionStorage.setItem(storageKey, 'invalid json');

    const { result } = renderHook(() =>
      useFormAutoSave({
        storageKey,
        data: { field1: '' },
        walletAddress,
      })
    );

    expect(result.current.hasSavedData).toBe(false);
  });

  it('saves data with updated values', () => {
    const { rerender } = renderHook(
      ({ data }) =>
        useFormAutoSave({
          storageKey,
          data,
          walletAddress,
          interval: 5000,
        }),
      {
        initialProps: { data: { field1: 'initial' } },
      }
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    let saved = JSON.parse(sessionStorage.getItem(storageKey)!);
    expect(saved.data.field1).toBe('initial');

    rerender({ data: { field1: 'updated' } });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    saved = JSON.parse(sessionStorage.getItem(storageKey)!);
    expect(saved.data.field1).toBe('updated');
  });

  // ── Expiry logic ───────────────────────────────────────────────────────

  describe('expiry logic', () => {
    it('discards expired data on mount and hasSavedData stays false', () => {
      // Store a draft that already expired (expiresAt in the past)
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: { field1: 'stale' },
          expiresAt: Date.now() - 1000,
        })
      );

      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: '' },
          expiryMs: 3_600_000,
        })
      );

      expect(result.current.hasSavedData).toBe(false);
      // Entry must be removed from sessionStorage
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    });

    it('discards expired data when restoreSavedData is called', () => {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: { field1: 'stale' },
          expiresAt: Date.now() - 1000,
        })
      );

      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: '' },
          expiryMs: 3_600_000,
        })
      );

      let restored: { field1: string } | null = null;
      act(() => {
        restored = result.current.restoreSavedData();
      });

      expect(restored).toBeNull();
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    });

    it('restores non-expired data', () => {
      const savedData = { field1: 'fresh' };
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: savedData,
          expiresAt: Date.now() + 3_600_000,
        })
      );

      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: '' },
          expiryMs: 3_600_000,
        })
      );

      let restored: typeof savedData | null = null;
      act(() => {
        restored = result.current.restoreSavedData();
      });

      expect(restored).toEqual(savedData);
    });
  });

  // ── Draft saved indicator ──────────────────────────────────────────────────

  describe('draftSaved indicator', () => {
    it('is false initially', () => {
      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: 'hello' },
          walletAddress,
        })
      );

      expect(result.current.draftSaved).toBe(false);
    });

    it('becomes true 1 s after the last data change', () => {
      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: 'hello' },
          walletAddress,
        })
      );

      // Before 1 s – still false
      act(() => {
        jest.advanceTimersByTime(999);
      });
      expect(result.current.draftSaved).toBe(false);

      // After 1 s – true
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.draftSaved).toBe(true);
    });

    it('resets to false after 3 s of being visible', () => {
      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: 'hello' },
          walletAddress,
        })
      );

      // Show the indicator
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.draftSaved).toBe(true);

      // After another 3 s it should hide
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(result.current.draftSaved).toBe(false);
    });

    it('debounces: does not show indicator until typing pauses for 1 s', () => {
      const { result, rerender } = renderHook(
        ({ data }) =>
          useFormAutoSave({
            storageKey,
            data,
            walletAddress,
          }),
        { initialProps: { data: { field1: 'a' } } }
      );

      // Simulate rapid keystrokes at 400 ms intervals
      act(() => {
        jest.advanceTimersByTime(400);
      });
      rerender({ data: { field1: 'ab' } });

      act(() => {
        jest.advanceTimersByTime(400);
      });
      rerender({ data: { field1: 'abc' } });

      // Only 400 ms since last change — still false
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(result.current.draftSaved).toBe(false);

      // Now let 1 s pass with no further changes
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(result.current.draftSaved).toBe(true);
    });

    it('does not show indicator when enabled is false', () => {
      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: 'hello' },
          walletAddress,
          enabled: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.draftSaved).toBe(false);
    });

    it('does not show indicator for empty data', () => {
      const { result } = renderHook(() =>
        useFormAutoSave({
          storageKey,
          data: { field1: '' },
          walletAddress,
        })
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.draftSaved).toBe(false);
    });
  });
});
