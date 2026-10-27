import { describe, expect, it } from 'vitest';
import { SNOOZE_MS, detectPlatform, shouldRemind } from '../src/utils/install';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const MAC = IPAD_AS_MAC;
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

describe('add to home screen reminder', () => {
  it('tells iPhone, iPad (even when it pretends to be a Mac), Android and desktops apart', () => {
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(IPAD_AS_MAC, 5)).toBe('ios');
    expect(detectPlatform(PIXEL, 5)).toBe('android');
    expect(detectPlatform(MAC, 0)).toBe('other'); // a real Mac has no touch screen
    expect(detectPlatform(WIN)).toBe('other');
  });

  it('reminds on a phone in a browser tab, but never on desktop, never when already installed', () => {
    const fresh = { until: 0, never: false };
    expect(shouldRemind('ios', false, fresh, 1000)).toBe(true);
    expect(shouldRemind('android', false, fresh, 1000)).toBe(true);
    expect(shouldRemind('other', false, fresh, 1000)).toBe(false);
    expect(shouldRemind('ios', true, fresh, 1000)).toBe(false); // launched from the home screen
    expect(shouldRemind('android', true, fresh, 1000)).toBe(false);
  });

  it('stays quiet while snoozed, comes back after the snooze, and never returns once switched off', () => {
    const now = 10_000_000;
    const snoozed = { until: now + SNOOZE_MS, never: false };
    expect(shouldRemind('ios', false, snoozed, now + 1000)).toBe(false);
    expect(shouldRemind('ios', false, snoozed, now + SNOOZE_MS + 1)).toBe(true);
    expect(shouldRemind('android', false, { until: 0, never: true }, now + 10 * SNOOZE_MS)).toBe(false);
  });
});
