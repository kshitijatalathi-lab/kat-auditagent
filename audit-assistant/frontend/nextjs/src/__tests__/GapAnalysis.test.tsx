import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { GapAnalysis, ScoredItem } from '@/components/audit/GapAnalysis';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(async () => ({ count: 1, items: [{ question: 'Q1', score: 2 }] })),
}));

describe('GapAnalysis', () => {
  it('runs gap analysis and renders results', async () => {
    const buildItems = (): ScoredItem[] => [
      { question: 'Q1', user_answer: 'A1', score: 2 },
      { question: 'Q2', user_answer: 'A2', score: 5 },
    ];

    render(<GapAnalysis buildItems={buildItems} />);

    const btn = screen.getByRole('button', { name: /run gap analysis/i });
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText(/Gaps \(1\)/)).toBeInTheDocument());
    expect(screen.getByText('Q1')).toBeInTheDocument();
  });
});
