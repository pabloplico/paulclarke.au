import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DIMENSION_QUESTIONS } from '@/lib/assessment-content';
import { AssessmentStateProvider, useAssessmentState } from './assessment-state';
import { useAssessment } from './useAssessment';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AssessmentStateProvider>{children}</AssessmentStateProvider>
);

describe('useAssessment', () => {
  it('starts empty with no results', () => {
    const { result } = renderHook(() => useAssessment(), { wrapper });
    expect(result.current.profile).toEqual({
      industry: null,
      maturityLevel: null,
      painPoints: [],
      dimensionAnswers: {},
    });
    expect(result.current.results).toBeNull();
  });

  it('produces results once an industry and maturity level are chosen', () => {
    const { result } = renderHook(() => useAssessment(), { wrapper });

    act(() => result.current.updateProfile({ industry: 'retail' }));
    expect(result.current.results).toBeNull();

    act(() => result.current.updateProfile({ maturityLevel: 'implementing' }));
    expect(result.current.results?.overallLevel).toBe('implementing');
  });

  it('merges profile patches instead of replacing the profile', () => {
    const { result } = renderHook(() => useAssessment(), { wrapper });
    act(() => result.current.updateProfile({ industry: 'trades' }));
    act(() => result.current.updateProfile({ painPoints: ['admin-overload'] }));
    expect(result.current.profile.industry).toBe('trades');
    expect(result.current.profile.painPoints).toEqual(['admin-overload']);
  });

  it('records star ratings per question and rescores', () => {
    const [question] = DIMENSION_QUESTIONS;
    if (!question) throw new Error('expected at least one question');
    const { result } = renderHook(() => useAssessment(), { wrapper });

    act(() => result.current.updateProfile({ industry: 'retail', maturityLevel: 'emerging' }));
    const before = result.current.results?.overallScore;
    act(() => result.current.updateDimensionAnswer(question.id, 4));

    expect(result.current.profile.dimensionAnswers).toEqual({ [question.id]: 4 });
    expect(result.current.results?.overallScore).not.toBe(before);
  });

  it('clearing a star rating makes the question unanswered, not 0', () => {
    const [question] = DIMENSION_QUESTIONS;
    if (!question) throw new Error('expected at least one question');
    const { result } = renderHook(() => useAssessment(), { wrapper });

    // With an industry but no maturity level, results exist only while a rating is answered
    act(() => result.current.updateProfile({ industry: 'retail' }));
    act(() => result.current.updateDimensionAnswer(question.id, 3));
    expect(result.current.results).not.toBeNull();

    act(() => result.current.updateDimensionAnswer(question.id, null));
    expect(result.current.profile.dimensionAnswers).toEqual({});
    expect(result.current.results).toBeNull();
  });

  it('restart clears every answer and scrolls to the top', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { result } = renderHook(() => useAssessment(), { wrapper });

    act(() => result.current.updateProfile({ industry: 'retail', maturityLevel: 'leading' }));
    act(() => result.current.restart());

    expect(result.current.results).toBeNull();
    expect(result.current.profile.industry).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('keeps answers in the provider, so they survive the page unmounting', async () => {
    // Mirrors navigating away from /assessment and back: the provider sits above the router
    function Picker() {
      const { updateProfile } = useAssessmentState();
      return (
        <button type="button" onClick={() => updateProfile({ industry: 'health' })}>
          pick
        </button>
      );
    }
    function Reader() {
      return <p>{useAssessmentState().profile.industry ?? 'none'}</p>;
    }

    const { rerender } = render(<Picker />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'pick' }));
    rerender(<Reader />);
    expect(screen.getByText('health')).toBeDefined();
  });

  it('throws a clear error when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAssessment())).toThrow(/AssessmentStateProvider/);
  });
});
