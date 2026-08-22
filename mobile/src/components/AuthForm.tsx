import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { colors, layout, spacing, typography } from '@/theme';
import type { UserRole } from '@/types';

interface AuthFormProps {
  mode: 'login' | 'register';
  submitLabel: string;
  onSubmit: (email: string, password: string, displayName?: string, role?: UserRole) => Promise<void>;
}

function authErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요.';
    if (error.status === 409) return '이미 가입된 이메일이에요. 로그인해 주세요.';
    return error.message;
  }
  return '연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.';
}

export function AuthForm({ mode, submitLabel, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('USER');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = email.includes('@') && password.length >= 10 && (mode === 'login' || displayName.trim().length > 0);

  async function submit() {
    if (!valid || loading) return;
    setError(null);
    setLoading(true);
    try {
      await onSubmit(email.trim().toLowerCase(), password, displayName.trim(), role);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.form}>
      {mode === 'register' ? (
        <>
          <TextField
            autoCapitalize="words"
            autoComplete="name"
            label="이름"
            onChangeText={setDisplayName}
            placeholder="홍길동"
            returnKeyType="next"
            value={displayName}
          />
          <SegmentedControl
            label="이 앱을 어떻게 사용하시나요?"
            onChange={(value) => setRole(value as UserRole)}
            options={[
              { label: '내 문서 관리', value: 'USER' },
              { label: '가족 문서 돕기', value: 'GUARDIAN' },
            ]}
            value={role}
          />
        </>
      ) : null}
      <TextField
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        keyboardType="email-address"
        label="이메일"
        onChangeText={setEmail}
        placeholder="name@example.com"
        returnKeyType="next"
        value={email}
      />
      <TextField
        autoCapitalize="none"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        helperText={mode === 'register' ? '10자 이상 입력해 주세요.' : undefined}
        label="비밀번호"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="10자 이상"
        returnKeyType="done"
        secureTextEntry={!passwordVisible}
        trailing={(
          <Pressable
            accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setPasswordVisible((current) => !current)}
            style={styles.eye}
          >
            <Ionicons
              color={colors.foregroundTertiary}
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={23}
            />
          </Pressable>
        )}
        value={password}
      />
      {error ? (
        <View accessibilityRole="alert" style={styles.errorRow}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={22} />
          <AppText style={styles.error}>{error}</AppText>
        </View>
      ) : null}
      <AppButton
        disabled={!valid}
        label={submitLabel}
        loading={loading}
        loadingLabel="확인하고 있어요"
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.x4 },
  eye: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget, minWidth: 40 },
  errorRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.x2 },
  error: { ...typography.bodySmall, color: colors.danger, flex: 1 },
});
