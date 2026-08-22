import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { DocumentStatusBadge } from '@/components/DocumentStatusBadge';
import type { DocumentStatus } from '@/types';

const cases: { status: DocumentStatus; label: string }[] = [
  { status: 'NEEDS_RECAPTURE', label: '재촬영 필요' },
  { status: 'NEEDS_CONFIRMATION', label: '중요 정보 확인' },
  { status: 'READY', label: '처리 준비 완료' },
  { status: 'FAILED', label: '다시 시도 필요' },
];

describe('DocumentStatusBadge', () => {
  it.each(cases)('shows a text label for $status', async ({ status, label }) => {
    await render(<DocumentStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
