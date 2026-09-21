// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ROICalculator from './ROICalculator';
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(createElement(MemoryRouter, null, createElement(ROICalculator)));
test('five routes use picking hours rather than the entire workday', () => {
  show();
  expect(screen.getByText('$1,194.38')).toBeTruthy();
  expect(screen.getByText('$100.00/mo')).toBeTruthy();
  expect(screen.getByText('$1,094.38')).toBeTruthy();
});
test('zero picking time has no labor benefit and still includes subscription', () => {
  show();
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'0'}});
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getByText('-$100.00')).toBeTruthy();
});
test('changing workdays changes annualized savings; invalid negative hours cannot create savings', () => {
  show();
  fireEvent.change(screen.getByLabelText('Picking days per week'), {target:{value:'4'}});
  expect(screen.getByText('$955.50')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Picking hours per route per workday'), {target:{value:'-2'}});
  expect(screen.getByText('$0.00')).toBeTruthy();
});


test('route count changes savings without changing driver subscription cost', () => {
  show();
  fireEvent.change(screen.getByLabelText('Routes picked per workday'), {target:{value:'10'}});
  expect(screen.getByText('$2,388.75')).toBeTruthy();
  expect(screen.getByText('$100.00/mo')).toBeTruthy();
  expect(screen.getByText('$2,288.75')).toBeTruthy();
});
test('driver tier changes subscription without changing route savings', () => {
  show();
  fireEvent.keyDown(screen.getByRole('slider'), {key:'ArrowRight'});
  expect(screen.getByText('$1,194.38')).toBeTruthy();
  expect(screen.getByText('$108.00/mo')).toBeTruthy();
  expect(screen.getByText('$1,086.38')).toBeTruthy();
});
