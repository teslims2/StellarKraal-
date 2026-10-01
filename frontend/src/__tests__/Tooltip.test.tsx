/**
 * Tests for Tooltip component — #557 / #833
 *
 * Verifies:
 * - Renders children
 * - Shows on hover and focus
 * - Closes on Escape and blur
 * - Automatically detects viewport overflow and flips top/bottom (#833)
 * - Automatically detects viewport overflow and flips left/right (#833)
 * - Arrow indicator updates matching flipped position (#833)
 * - Recalculates position on window resize (#833)
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Tooltip, { FieldTooltip } from '../components/Tooltip';

describe('Tooltip component (#833)', () => {
  it('renders children without showing tooltip initially', () => {
    render(
      <Tooltip hint="Helpful hint">
        <button>Trigger Button</button>
      </Tooltip>
    );

    expect(screen.getByRole('button', { name: 'Trigger Button' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on mouseenter and hides on mouseleave', () => {
    render(
      <Tooltip hint="Helpful hint">
        <button>Trigger Button</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Trigger Button' });
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Helpful hint');

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides tooltip on Escape keydown', () => {
    render(
      <Tooltip hint="Helpful hint">
        <button>Trigger Button</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Trigger Button' });
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  describe('viewport overflow detection and flipping (#833)', () => {
    it('flips from top to bottom when trigger is near top of viewport', () => {
      render(
        <Tooltip hint="Top edge test">
          <button>Edge Button</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button', { name: 'Edge Button' });

      // Mock trigger bounding rect near top edge (top: 25px < 80px)
      jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        top: 25,
        bottom: 50,
        left: 200,
        right: 300,
        width: 100,
        height: 25,
        x: 200,
        y: 25,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(trigger);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip.getAttribute('data-side')).toBe('bottom');
      expect(tooltip.className).toContain('top-full');

      // Arrow indicator points up when tooltip is below trigger
      const arrow = screen.getByTestId('tooltip-arrow');
      expect(arrow.getAttribute('data-side')).toBe('bottom');
      expect(arrow.className).toContain('-top-1.5');
    });

    it('flips to right-aligned when trigger is near right viewport edge', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
      render(
        <Tooltip hint="Right edge test">
          <button>Right Button</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button', { name: 'Right Button' });

      jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        top: 300,
        bottom: 330,
        left: 450,
        right: 490,
        width: 40,
        height: 30,
        x: 450,
        y: 300,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(trigger);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.getAttribute('data-align')).toBe('right');
      expect(tooltip.className).toContain('right-0');

      const arrow = screen.getByTestId('tooltip-arrow');
      expect(arrow.getAttribute('data-align')).toBe('right');
      expect(arrow.className).toContain('right-4');
    });

    it('flips to left-aligned when trigger is near left viewport edge', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      render(
        <Tooltip hint="Left edge test">
          <button>Left Button</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button', { name: 'Left Button' });

      jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        top: 300,
        bottom: 330,
        left: 10,
        right: 50,
        width: 40,
        height: 30,
        x: 10,
        y: 300,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(trigger);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.getAttribute('data-align')).toBe('left');
      expect(tooltip.className).toContain('left-0');

      const arrow = screen.getByTestId('tooltip-arrow');
      expect(arrow.getAttribute('data-align')).toBe('left');
      expect(arrow.className).toContain('left-4');
    });

    it('recalculates position on window resize', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      render(
        <Tooltip hint="Resize test">
          <button>Resize Button</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button', { name: 'Resize Button' });

      jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        top: 300,
        bottom: 330,
        left: 500,
        right: 540,
        width: 40,
        height: 30,
        x: 500,
        y: 300,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(trigger);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.getAttribute('data-align')).toBe('center');

      // Resize window so trigger is near right edge
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 560 });
      fireEvent(window, new Event('resize'));

      expect(tooltip.getAttribute('data-align')).toBe('right');
    });
  });

  describe('FieldTooltip export from Tooltip.tsx (#833)', () => {
    it('flips position when near top of viewport', () => {
      render(<FieldTooltip hint="Field info hint" />);
      const btn = screen.getByRole('button', { name: 'More information' });

      jest.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
        top: 20,
        bottom: 36,
        left: 200,
        right: 216,
        width: 16,
        height: 16,
        x: 200,
        y: 20,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.getAttribute('data-side')).toBe('bottom');

      const arrow = screen.getByTestId('tooltip-arrow');
      expect(arrow.getAttribute('data-side')).toBe('bottom');
    });
  });
});
