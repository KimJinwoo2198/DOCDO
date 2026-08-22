import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';

import { AppButton } from '@/components/AppButton';

describe('AppButton', () => {
  it('exposes its action to assistive technology and handles a press', async () => {
    const onPress = jest.fn();
    await render(
      <AppButton
        accessibilityHint="문서 분석을 시작합니다"
        label="분석 시작"
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', { name: '분석 시작' });
    expect(button.props.accessibilityHint).toBe('문서 분석을 시작합니다');
    await userEvent.setup().press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<AppButton disabled label="확인" onPress={onPress} />);

    const button = screen.getByRole('button', { name: '확인' });
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
