import assert from 'node:assert/strict';
import test from 'node:test';
import { QUALITY_PRESETS, qualityPreset } from '../src/rendering/quality-presets.ts';

test('quality presets make material performance changes, not label-only changes', () => {
  assert.ok(QUALITY_PRESETS.low.resolutionScale < QUALITY_PRESETS.high.resolutionScale);
  assert.ok(QUALITY_PRESETS.medium.maxDistance < QUALITY_PRESETS.ultra.maxDistance);
  assert.equal(QUALITY_PRESETS.low.shadowQuality, 'off');
  assert.equal(QUALITY_PRESETS.high.antiAliasing, true);
  assert.equal(QUALITY_PRESETS.ultra.textureQuality, 'ultra');
  const copy = qualityPreset('high');
  assert.notEqual(copy, QUALITY_PRESETS.high);
});
