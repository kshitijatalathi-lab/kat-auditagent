import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BatchScoring } from '@/components/audit/BatchScoring';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(async () => ({
    items: [{ question: 'Q1', score: 3 }],
    composite_score: 3,
  })),
}));

describe('BatchScoring', () => {
  it('runs batch scoring and shows results', async () => {
    const buildItems = () => [{ question: 'Q1', user_answer: 'A1' }];

    render(
      <BatchScoring
        sessionId="s1"
        orgId="o1"
        framework="GDPR"
        k={5}
        buildItems={buildItems}
      />
    );

    const btn = screen.getByRole('button', { name: /score all answered/i });
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText(/Composite Score:/i)).toBeInTheDocument());
    expect(screen.getByText('Q1')).toBeInTheDocument();
    expect(screen.getByText(/score 3/i)).toBeInTheDocument();
  });

  it('handles empty items gracefully', async () => {
    const buildItems = () => [] as any[];
    render(
      <BatchScoring
        sessionId="s1"
        orgId="o1"
        framework="GDPR"
        k={5}
        buildItems={buildItems}
      />
    );
    const btn = screen.getByRole('button', { name: /score all answered/i });
    fireEvent.click(btn);
    // Since it returns early, no results should appear
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Composite Score:/i)).not.toBeInTheDocument();
  });
});
