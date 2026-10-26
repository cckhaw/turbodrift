import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, nextHudMode, sanitize } from '../src/utils/settings';

describe('race panel (HUD) setting', () => {
  it('defaults to full and rejects junk', () => {
    expect(DEFAULT_SETTINGS.hud).toBe('full');
    expect(sanitize({ hud: 'huge' }).hud).toBe('full');
    expect(sanitize(null).hud).toBe('full');
    expect(sanitize({ hud: 'compact' }).hud).toBe('compact');
    expect(sanitize({ hud: 'off' }).hud).toBe('off');
  });
  it('cycles full → compact → off → full', () => {
    expect(nextHudMode('full')).toBe('compact');
    expect(nextHudMode('compact')).toBe('off');
    expect(nextHudMode('off')).toBe('full');
  });
});
