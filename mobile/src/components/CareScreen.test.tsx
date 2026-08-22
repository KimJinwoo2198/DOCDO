import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';

import CareScreen, { FamilyAddChoices } from '../../app/(tabs)/care';

const mockInvalidateQueries = jest.fn();
const mockMutate = jest.fn();

jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      display_name: '김보호',
      email: 'guardian@example.com',
      id: 'guardian-id',
      role: 'GUARDIAN',
    },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutate: mockMutate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'relationships') {
      return {
        data: [
          {
            created_at: '2026-08-22T12:00:00Z',
            guardian_id: 'guardian-id',
            guardian_name: '김보호',
            id: 'relationship-id',
            owner_id: 'owner-id',
            owner_name: '김영자',
            status: 'ACTIVE',
          },
        ],
      };
    }
    if (queryKey[0] === 'dashboard') return { data: { recent_activity: [] } };
    return { data: undefined };
  },
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    getQueryData: jest.fn(),
    invalidateQueries: mockInvalidateQueries,
    setQueryData: jest.fn(),
  }),
}));

describe('CareScreen', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear();
    mockMutate.mockClear();
  });

  it('shows the guardian experience and keeps the add button beside connected family', async () => {
    await render(<CareScreen />);

    expect(screen.getByText('보호자 화면')).toBeTruthy();
    expect(screen.getByText('김영자')).toBeTruthy();
    expect(screen.getByLabelText('가족 추가')).toBeTruthy();
  });

  it('offers code entry and invitation as explicit family-add choices', async () => {
    const chooseCodeEntry = jest.fn();
    const chooseInvitation = jest.fn();

    await render(
      <FamilyAddChoices
        onChooseCodeEntry={chooseCodeEntry}
        onChooseInvitation={chooseInvitation}
      />,
    );

    expect(screen.getByText('초대코드 입력하기')).toBeTruthy();
    expect(screen.getByText('보호자 초대하기')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByLabelText('초대코드 입력하기'));
    await user.press(screen.getByLabelText('보호자 초대하기'));

    expect(chooseCodeEntry).toHaveBeenCalledTimes(1);
    expect(chooseInvitation).toHaveBeenCalledTimes(1);
  });
});
