/* eslint-disable import/first */
import { describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: class MockExpoFile {
    readonly name = 'captured-document.jpg';
    readonly type = 'image/jpeg';
    readonly uri: string;

    constructor(fileUri: string) {
      this.uri = fileUri;
    }

    async bytes() {
      return new Uint8Array([0xff, 0xd8, 0xff]);
    }
  },
}));

import { buildDocumentForm, createNativeUploadPart } from '@/api/client';

describe('buildDocumentForm', () => {
  it('uses an Expo File for native multipart uploads', async () => {
    expect(Platform.OS).not.toBe('web');

    const asset = {
      uri: 'file:///tmp/document.jpg',
      name: 'document.jpg',
      mimeType: 'image/jpeg',
    };
    const file = createNativeUploadPart(asset) as Blob & { bytes?: () => Promise<Uint8Array> };
    const form = await buildDocumentForm([asset]);

    expect(file.bytes).toEqual(expect.any(Function));
    expect(form.get('consent_to_analysis')).toBe('true');
  });
});
