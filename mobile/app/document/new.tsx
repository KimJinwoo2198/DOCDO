import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, api, type PickedAsset } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { CheckboxRow } from '@/components/CheckboxRow';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { reconcileReminders } from '@/notifications';
import { colors, layout, radii, sizes, spacing, typography } from '@/theme';

function idempotencyKey() {
  return 'document-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

async function normalizeImage(uri: string): Promise<PickedAsset> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.86,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return {
    uri: result.uri,
    name: 'document-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg',
    mimeType: 'image/jpeg',
  };
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 413) return '파일이 너무 커요. 페이지 수를 줄이거나 사진을 다시 촬영해 주세요.';
    if (error.status === 415 || error.status === 422) return '이 파일 형식은 읽을 수 없어요. 사진이나 PDF를 선택해 주세요.';
    if (error.status >= 500) return '문서 서버가 잠시 응답하지 않아요. 사진은 그대로 두었으니 잠시 후 다시 눌러 주세요.';
    return error.message;
  }
  return '휴대폰에서 파일을 보내지 못했어요. Wi-Fi 연결을 확인한 뒤 다시 눌러 주세요.';
}

function CameraControl({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.cameraControl, pressed && styles.cameraPressed]}>
      <View style={styles.cameraControlIcon}><Ionicons color={colors.foregroundInverse} name={icon} size={23} /></View>
      <AppText style={styles.cameraControlLabel}>{label}</AppText>
    </Pressable>
  );
}

export default function NewDocumentScreen() {
  const { replaceId } = useLocalSearchParams<{ replaceId?: string }>();
  const { user } = useAuth();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const requestKey = useRef(idempotencyKey());
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [taking, setTaking] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [consented, setConsented] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const cameraControlsHeight = 140 + insets.bottom;

  useEffect(() => {
    if (permission === null) requestPermission().catch(() => undefined);
  }, [permission, requestPermission]);

  const mutation = useMutation({
    mutationFn: () => replaceId
      ? api.replaceDocumentPages(replaceId, assets)
      : api.createDocument(assets, requestKey.current),
    onSuccess: (document) => {
      client.invalidateQueries({ queryKey: ['dashboard'] });
      client.invalidateQueries({ queryKey: ['documents'] });
      if (replaceId) reconcileReminders().catch(() => undefined);
      router.replace({ pathname: '/document/[id]', params: { id: document.id } });
    },
    onError: (error) => setUploadError(uploadErrorMessage(error)),
  });

  async function takePhoto() {
    if (!camera.current || !cameraReady || taking) return;
    setLocalError(null);
    setTaking(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1, shutterSound: true });
      const normalized = await normalizeImage(picture.uri);
      setAssets((current) => [...current, normalized].slice(0, 10));
      setCameraActive(false);
    } catch {
      setLocalError('사진을 저장하지 못했어요. 카메라를 다시 맞춘 뒤 촬영해 주세요.');
    } finally {
      setTaking(false);
    }
  }

  async function choosePhotos() {
    setLocalError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        quality: 1,
        selectionLimit: Math.max(1, 10 - assets.length),
      });
      if (!result.canceled) {
        const normalized = await Promise.all(result.assets.map((asset) => normalizeImage(asset.uri)));
        setAssets((current) => [...current.filter((item) => item.mimeType !== 'application/pdf'), ...normalized].slice(0, 10));
        setCameraActive(false);
      }
    } catch {
      setLocalError('사진 보관함의 파일을 읽지 못했어요. 다른 사진을 선택해 주세요.');
    }
  }

  async function choosePdf() {
    setLocalError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: 'application/pdf' });
      if (!result.canceled && result.assets[0]) {
        const picked = result.assets[0];
        setAssets([{ uri: picked.uri, name: picked.name, mimeType: 'application/pdf' }]);
        setCameraActive(false);
      }
    } catch {
      setLocalError('PDF 파일을 읽지 못했어요. 다른 파일을 선택해 주세요.');
    }
  }

  if (user?.role !== 'USER') {
    return (
      <Screen>
        <TopBar title="문서 촬영" />
        <Card variant="warning"><AppText>문서 촬영은 문서 사용자 계정에서 할 수 있어요.</AppText></Card>
        <AppButton label="홈으로 돌아가기" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  if (!cameraActive && assets.length) {
    return (
      <Screen
        contentContainerStyle={styles.reviewScreen}
        footer={<AppButton disabled={!consented} label={replaceId ? '새 사진으로 다시 분석' : '문서 분석 시작'} loading={mutation.isPending} loadingLabel="문서를 보내고 있어요" onPress={() => { setUploadError(null); mutation.mutate(); }} />}
      >
        <TopBar title={replaceId ? '다시 촬영한 문서' : '촬영한 문서'} />
        <View style={styles.reviewHeader}>
          <AppText accessibilityRole="header" style={styles.reviewTitle}>글자가 잘 보이나요?</AppText>
          <AppText style={styles.reviewDescription}>문서 전체와 금액·날짜가 선명한지 확인해 주세요.</AppText>
        </View>
        {assets.map((asset, index) => (
          <View key={asset.uri + '-' + index} style={styles.previewCard}>
            {asset.mimeType.startsWith('image/') ? (
              <Image accessibilityLabel={(index + 1) + '번째 문서 미리보기'} resizeMode="contain" source={{ uri: asset.uri }} style={styles.preview} />
            ) : (
              <View accessibilityLabel="선택한 PDF 문서" style={styles.pdfPreview}>
                <Ionicons color={colors.foregroundBrand} name="document-text-outline" size={48} />
                <AppText style={styles.pdfLabel}>PDF</AppText>
              </View>
            )}
            <View style={styles.previewMeta}>
              <AppText numberOfLines={1} style={styles.previewName}>{index + 1}쪽 · {asset.name}</AppText>
              <Pressable accessibilityLabel={(index + 1) + '쪽 삭제'} accessibilityRole="button" hitSlop={8} onPress={() => setAssets((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.deletePage}>
                <Ionicons color={colors.danger} name="trash-outline" size={20} />
              </Pressable>
            </View>
          </View>
        ))}
        <View style={styles.reviewActions}>
          {assets.length < 10 && assets[0]?.mimeType !== 'application/pdf' ? <AppButton icon="camera-outline" label="한 장 더 촬영" onPress={() => setCameraActive(true)} variant="secondary" /> : null}
          <AppButton icon="images-outline" label="앨범에서 추가" onPress={choosePhotos} variant="secondary" />
          <AppButton icon="document-outline" label="PDF로 바꾸기" onPress={choosePdf} variant="ghost" />
        </View>
        <Card padding="compact" variant="warning">
          <CheckboxRow checked={consented} description="파일은 분석을 위해 Upstage에 전송되고 원본은 7일 뒤 자동 삭제돼요." onPress={() => setConsented((current) => !current)} title="문서 분석과 7일 보관에 동의해요" />
        </Card>
        {uploadError ? (
          <Card accessibilityRole="alert" variant="danger">
            <AppText style={styles.errorTitle}>문서를 보내지 못했어요</AppText>
            <AppText style={styles.errorMessage}>{uploadError}</AppText>
          </Card>
        ) : null}
        <AppText style={styles.retention}>분석 결과와 처리 기록은 직접 삭제하거나 탈퇴할 때까지 보관돼요.</AppText>
      </Screen>
    );
  }

  if (!permission) {
    return <View style={styles.permissionLoading}><ActivityIndicator color={colors.actionPrimary} size="large" /></View>;
  }

  if (!permission.granted || Platform.OS === 'web') {
    return (
      <Screen>
        <TopBar title="문서 촬영" />
        <View style={styles.permissionCopy}>
          <View style={styles.permissionIcon}><Ionicons color={colors.foregroundBrand} name="camera-outline" size={32} /></View>
          <AppText accessibilityRole="header" style={styles.reviewTitle}>{Platform.OS === 'web' ? '웹에서는 파일을 선택해 주세요' : '카메라 권한이 필요해요'}</AppText>
          <AppText style={styles.reviewDescription}>{Platform.OS === 'web' ? '휴대폰 앱에서는 이 화면에 들어오자마자 카메라가 열려요.' : '설정에서 카메라 접근을 허용하면 문서 촬영을 바로 시작할 수 있어요.'}</AppText>
        </View>
        {Platform.OS !== 'web' ? <AppButton label={permission.canAskAgain ? '카메라 권한 다시 요청' : '설정에서 카메라 허용'} onPress={() => permission.canAskAgain ? requestPermission() : Linking.openSettings()} /> : null}
        <AppButton icon="images-outline" label="앨범에서 선택" onPress={choosePhotos} variant="secondary" />
        <AppButton icon="document-outline" label="PDF 선택" onPress={choosePdf} variant="secondary" />
        {localError ? <Card variant="danger"><AppText style={styles.errorMessage}>{localError}</AppText></Card> : null}
      </Screen>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <StatusBar style="light" />
      <CameraView active={cameraActive} facing={facing} flash={flash} onCameraReady={() => setCameraReady(true)} ref={camera} style={StyleSheet.absoluteFill} />
      <View style={styles.cameraOverlay}>
        <View style={[styles.cameraBody, { paddingBottom: cameraControlsHeight, paddingTop: insets.top + spacing.x3 }]}>
          <View style={styles.cameraTop}>
            <Pressable accessibilityLabel="촬영 취소" accessibilityRole="button" onPress={() => router.back()} style={styles.cameraTopButton}>
              <Ionicons color={colors.foregroundInverse} name="close" size={23} />
            </Pressable>
            <Pressable accessibilityLabel={flash === 'off' ? '플래시 켜기' : '플래시 끄기'} accessibilityRole="button" accessibilityState={{ selected: flash !== 'off' }} onPress={() => setFlash((current) => current === 'off' ? 'on' : 'off')} style={styles.cameraTopButton}>
              <Ionicons color={flash === 'off' ? colors.foregroundInverse : colors.warning} name={flash === 'off' ? 'flash-outline' : 'flash'} size={22} />
            </Pressable>
          </View>
          <AppText accessibilityRole="header" style={styles.cameraInstruction}>문서 전체가 테두리 안에{`\n`}들어오게 해주세요</AppText>
          <View style={styles.guide}>
            <View style={[styles.cornerHorizontal, styles.topLeft]} />
            <View style={[styles.cornerHorizontal, styles.topRight]} />
            <View style={[styles.cornerHorizontal, styles.bottomLeft]} />
            <View style={[styles.cornerHorizontal, styles.bottomRight]} />
          </View>
          <AppText style={styles.cameraHint}>빛 반사를 피하고, 한 장씩 촬영해 주세요</AppText>
          {localError ? <View accessibilityRole="alert" style={styles.cameraError}><AppText style={styles.cameraErrorText}>{localError}</AppText></View> : null}
        </View>
        <View style={[styles.cameraControls, { height: cameraControlsHeight, paddingBottom: insets.bottom }]}>
          <CameraControl icon="images-outline" label="앨범" onPress={choosePhotos} />
          <Pressable accessibilityLabel="문서 촬영" accessibilityRole="button" disabled={!cameraReady || taking} onPress={takePhoto} style={({ pressed }) => [styles.shutterOuter, pressed && styles.cameraPressed, (!cameraReady || taking) && styles.shutterDisabled]}>
            {taking ? <ActivityIndicator color={colors.foregroundPrimary} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <CameraControl icon="camera-reverse-outline" label="회전" onPress={() => setFacing((current) => current === 'back' ? 'front' : 'back')} />
          <AppText style={styles.shutterLabel}>{taking ? '저장 중' : '촬영'}</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permissionLoading: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, flex: 1, justifyContent: 'center' },
  permissionCopy: { alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x8 },
  permissionIcon: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, borderRadius: radii.full, height: 64, justifyContent: 'center', width: 64 },
  reviewScreen: { gap: spacing.x5 },
  reviewHeader: { gap: spacing.x2 },
  reviewTitle: { ...typography.h2, color: colors.foregroundPrimary },
  reviewDescription: { ...typography.bodySmall, color: colors.foregroundSecondary },
  previewCard: { borderColor: colors.lineDefault, borderRadius: radii.hero, borderWidth: 1, overflow: 'hidden' },
  preview: { backgroundColor: colors.backgroundSecondary, height: 420, width: '100%' },
  pdfPreview: { alignItems: 'center', backgroundColor: colors.backgroundBrandWeak, height: 260, justifyContent: 'center' },
  pdfLabel: { ...typography.h3, color: colors.foregroundBrand, marginTop: spacing.x2 },
  previewMeta: { alignItems: 'center', flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.x4 },
  previewName: { ...typography.bodySmall, color: colors.foregroundPrimary, flex: 1 },
  deletePage: { alignItems: 'center', justifyContent: 'center', minHeight: layout.minimumTouchTarget, minWidth: layout.minimumTouchTarget },
  reviewActions: { gap: spacing.x3 },
  errorTitle: { ...typography.title, color: colors.danger },
  errorMessage: { ...typography.bodySmall, color: colors.foregroundPrimary, marginTop: spacing.x1 },
  retention: { ...typography.micro, color: colors.foregroundSecondary, textAlign: 'center' },
  cameraScreen: { backgroundColor: colors.cameraBackground, flex: 1 },
  cameraOverlay: { backgroundColor: colors.cameraGlass, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  cameraBody: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  cameraTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.x5 },
  cameraTopButton: { alignItems: 'center', backgroundColor: colors.cameraButton, borderRadius: 13, height: sizes.iconButton, justifyContent: 'center', width: sizes.iconButton },
  cameraInstruction: { ...typography.h3, color: colors.foregroundInverse, marginTop: spacing.x5, textAlign: 'center' },
  guide: { alignSelf: 'center', aspectRatio: 318 / 414, borderColor: colors.foregroundInverse, borderRadius: radii.surface, borderWidth: 2, marginTop: spacing.x5, maxWidth: 318, position: 'relative', width: '79%' },
  cornerHorizontal: { backgroundColor: colors.actionPrimary, height: 5, position: 'absolute', width: 34 },
  topLeft: { left: -2, top: -5 },
  topRight: { right: -2, top: -5 },
  bottomLeft: { bottom: -5, left: -2 },
  bottomRight: { bottom: -5, right: -2 },
  cameraHint: { ...typography.caption, color: colors.cameraMuted, marginTop: spacing.x6, textAlign: 'center' },
  cameraError: { alignSelf: 'center', backgroundColor: colors.overlay, borderRadius: radii.md, marginTop: spacing.x2, maxWidth: 320, padding: spacing.x3 },
  cameraErrorText: { ...typography.caption, color: colors.foregroundInverse, textAlign: 'center' },
  cameraControls: { backgroundColor: colors.cameraControls, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', left: 0, paddingHorizontal: spacing.x7, paddingTop: spacing.x6, position: 'absolute', right: 0 },
  cameraControl: { alignItems: 'center', minHeight: 100, width: 62 },
  cameraControlIcon: { alignItems: 'center', backgroundColor: colors.cameraButtonStrong, borderRadius: 17, height: 52, justifyContent: 'center', width: 52 },
  cameraControlLabel: { ...typography.caption, color: colors.cameraMuted, marginTop: spacing.x3, textAlign: 'center' },
  cameraPressed: { opacity: 0.66 },
  shutterOuter: { alignItems: 'center', backgroundColor: colors.foregroundInverse, borderColor: colors.foregroundInverse, borderRadius: radii.full, borderWidth: 4, height: 72, justifyContent: 'center', width: 72 },
  shutterInner: { backgroundColor: colors.backgroundPrimary, borderColor: colors.foregroundDisabled, borderRadius: radii.full, borderWidth: 2, height: 60, width: 60 },
  shutterDisabled: { opacity: 0.5 },
  shutterLabel: { ...typography.caption, color: colors.foregroundInverse, left: '50%', marginLeft: -50, position: 'absolute', textAlign: 'center', top: 109, width: 100 },
});
