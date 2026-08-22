import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';

import GuardianApprovalScreen from '../../app/approval/[id]';

const mockMutate = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'approval-id' }),
}));

jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'guardian-id', role: 'GUARDIAN' } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutate: mockMutate, variables: undefined }),
  useQuery: () => ({
    data: {
      action_description: '금액을 확인한 뒤 안내된 방법으로 납부하세요.',
      action_id: 'action-id',
      action_title: '전기요금 납부하기',
      amount: '58,320원',
      created_at: '2026-08-23T00:00:00Z',
      delivery_status: 'SENT',
      document_id: 'document-id',
      document_title: '전기요금 납부 고지서',
      due_date: '2026년 9월 10일',
      easy_summary: '이번 달 전기요금을 납부해 달라는 고지서예요.',
      expires_at: '2026-08-24T00:00:00Z',
      guardian_name: '김진우',
      id: 'approval-id',
      official_url_available: true,
      owner_name: '김영자',
      payment_url: null,
      relationship_id: 'relationship-id',
      source_anchor: { element_id: 'p1-e5', page: 1, quote: '공식 납부 주소' },
      status: 'PENDING',
      updated_at: '2026-08-23T00:00:00Z',
    },
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  }),
}));

describe('GuardianApprovalScreen', () => {
  it('shows confirmed values and lets the guardian approve or reject', async () => {
    mockMutate.mockClear();
    await render(<GuardianApprovalScreen />);

    expect(screen.getByText('58,320원')).toBeTruthy();
    expect(screen.getByText('2026년 9월 10일')).toBeTruthy();
    expect(screen.getByText(/돈은 나가지 않아요/)).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByLabelText('확인했고 승인해요'));
    await user.press(screen.getByLabelText('승인하지 않아요'));

    expect(mockMutate).toHaveBeenNthCalledWith(1, 'APPROVE');
    expect(mockMutate).toHaveBeenNthCalledWith(2, 'REJECT');
  });
});
