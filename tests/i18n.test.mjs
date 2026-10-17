import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, getLocale, setLocale, t } from '../cad/i18n.js';

test('switches CAD terminology, interpolated messages, and number formatting by locale', () => {
  setLocale('en', { persist: false });
  assert.equal(getLocale(), 'en');
  assert.equal(t('space.cad'), 'Parametric CAD');
  assert.equal(t('3 visibles'), '3 visible');
  assert.equal(t('La malla excede el presupuesto de triángulos. Reduce la resolución.'), 'The polygon mesh exceeds the triangle budget. Lower the mesh resolution.');
  assert.equal(t('El ancho debe ser un número finito.'), 'The width must be a finite number.');
  assert.equal(t('El archivo supera el límite de 40 MB.'), 'The file exceeds the 40 MB limit.');
  assert.equal(formatNumber(1.5), '1.5');

  setLocale('es', { persist: false });
  assert.equal(t('space.cad'), 'CAD paramétrico');
  assert.equal(t('error.meshBudget'), 'La malla supera el límite de triángulos. Reduce la resolución.');
  assert.equal(formatNumber(1.5), '1.5');
});
