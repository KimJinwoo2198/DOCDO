import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TextScaleContext } from '@/accessibility/AccessibilityContext';
import { AppText } from '@/components/AppText';

describe('AppText', () => {
  it('applies the saved accessibility scale to font size and line height', async () => {
    await render(
      <TextScaleContext.Provider value={1.4}>
        <AppText style={{ fontSize: 20, lineHeight: 28 }}>확대되는 설명</AppText>
      </TextScaleContext.Provider>,
    );

    const style = StyleSheet.flatten(screen.getByText('확대되는 설명').props.style);
    expect(style.fontSize).toBe(28);
    expect(style.lineHeight).toBe(39.2);
  });
});
