import { it, expect } from 'vitest';
import { MUSTER } from '../e2e/muster.fixture';
import { EXAMPLE, clone, sanitize } from '../../src/lib/pension/state';

it('der Musterfall der E2E-Tests ist der Musterfall des Rechenkerns', () => {
  const { ui, ...rest } = sanitize(clone(EXAMPLE));
  void ui;
  expect(MUSTER).toEqual(rest);
});
