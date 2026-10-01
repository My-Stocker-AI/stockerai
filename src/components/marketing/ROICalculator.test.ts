// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ROICalculator from './ROICalculator';
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(createElement(MemoryRouter, null, createElement(ROICalculator)));
test('the calculator starts with no unverified time-saving claim', () => {
  show();
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getByText('$100.00/mo')).toBeTruthy();
  expect(screen.getByText('Enter a reduction estimate')).toBeTruthy();
  expect(screen.queryByText('-$100.00')).toBeNull();
  expect((screen.getByLabelText('Your estimated picking-time reduction (%)') as HTMLInputElement).value).toBe('0');
});
test('zero picking time has no labor benefit and still includes subscription', () => {
  show();
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'0'}});
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getByText('Enter a reduction estimate')).toBeTruthy();
});
test('driver slider updates savings and applies six-driver pricing', () => {
  show();
  expect(screen.queryByLabelText('Routes picked per workday')).toBeNull();
  expect(screen.queryByLabelText('Picking days per week')).toBeNull();
  fireEvent.keyDown(screen.getByRole('slider'), {key:'ArrowRight'});
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getByText('$108.00/mo')).toBeTruthy();
  expect(screen.getByText('Enter a reduction estimate')).toBeTruthy();
});
test('a below-break-even estimate is described as additional cost, not negative savings', () => {
  show();
  fireEvent.change(screen.getByLabelText('Your estimated picking-time reduction (%)'), {target:{value:'1'}});
  expect(screen.getByText('$65.88 additional monthly cost')).toBeTruthy();
  expect(screen.queryByText('-$65.88')).toBeNull();
});
test('picking time remains adjustable with five workdays assumed', () => {
  show();
  fireEvent.change(screen.getByLabelText('Your estimated picking-time reduction (%)'), {target:{value:'35'}});
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'2'}});
  expect(screen.getByText('$1,592.50')).toBeTruthy();
  expect(screen.getByText('$1,492.50')).toBeTruthy();
});

test('the user controls the assumption from zero to one hundred percent', () => {
  show();
  const reduction = screen.getByLabelText('Your estimated picking-time reduction (%)');
  fireEvent.change(reduction, {target:{value:'25'}});
  expect(screen.getByText('$853.13')).toBeTruthy();
  fireEvent.change(reduction, {target:{value:'-10'}});
  expect((reduction as HTMLInputElement).value).toBe('0');
  fireEvent.change(reduction, {target:{value:'120'}});
  expect((reduction as HTMLInputElement).value).toBe('100');
  expect(screen.getByText('$3,412.50')).toBeTruthy();
});
