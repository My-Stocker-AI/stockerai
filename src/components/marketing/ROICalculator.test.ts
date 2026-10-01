// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ROICalculator from './ROICalculator';
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(createElement(MemoryRouter, null, createElement(ROICalculator)));
test('the calculator starts with the 35% illustrative estimate and correct five-driver math', () => {
  show();
  expect(screen.getByText('$1,194.38')).toBeTruthy();
  expect(screen.getByText('$100.00/mo')).toBeTruthy();
  expect(screen.getByText('$1,094.38')).toBeTruthy();
  expect(screen.getByText('Estimated monthly value after subscription')).toBeTruthy();
  const reduction = screen.getByLabelText('Estimated picking-time reduction') as HTMLSelectElement;
  expect(reduction.value).toBe('35');
  expect(Array.from(reduction.options, (option) => option.value)).toEqual(['25', '30', '35']);
});
test('zero picking time has no labor benefit and still includes subscription', () => {
  show();
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'0'}});
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getByText('$100.00 additional monthly cost')).toBeTruthy();
});
test('driver slider recalculates labor value and applies six-driver pricing', () => {
  show();
  expect(screen.queryByLabelText('Routes picked per workday')).toBeNull();
  expect(screen.queryByLabelText('Picking days per week')).toBeNull();
  fireEvent.keyDown(screen.getByRole('slider'), {key:'ArrowRight'});
  expect(screen.getByText('$1,433.25')).toBeTruthy();
  expect(screen.getByText('$108.00/mo')).toBeTruthy();
  expect(screen.getByText('$1,325.25')).toBeTruthy();
});
test('a below-break-even estimate is described as additional cost, not negative savings', () => {
  show();
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'0'}});
  expect(screen.getByText('$100.00 additional monthly cost')).toBeTruthy();
  expect(screen.queryByText('-$100.00')).toBeNull();
});
test('picking time remains adjustable with five workdays assumed', () => {
  show();
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'2'}});
  expect(screen.getByText('$1,592.50')).toBeTruthy();
  expect(screen.getByText('$1,492.50')).toBeTruthy();
});

test('the three reduction choices recalculate the result', () => {
  show();
  const reduction = screen.getByLabelText('Estimated picking-time reduction');
  fireEvent.change(reduction, {target:{value:'25'}});
  expect(screen.getByText('$853.13')).toBeTruthy();
  expect(screen.getByText('$753.13')).toBeTruthy();
  fireEvent.change(reduction, {target:{value:'30'}});
  expect(screen.getByText('$1,023.75')).toBeTruthy();
  expect(screen.getByText('$923.75')).toBeTruthy();
  fireEvent.change(reduction, {target:{value:'35'}});
  expect(screen.getByText('$1,194.38')).toBeTruthy();
  expect(screen.getByText('$1,094.38')).toBeTruthy();
});
