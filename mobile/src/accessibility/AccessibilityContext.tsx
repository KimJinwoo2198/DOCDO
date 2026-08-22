import { useQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext } from 'react';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export const TextScaleContext = createContext(1);

export function AccessibilityProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: api.profile,
    enabled: Boolean(user),
  });
  const textScale = user ? profile.data?.text_scale ?? 1 : 1;
  return <TextScaleContext.Provider value={textScale}>{children}</TextScaleContext.Provider>;
}

export function useTextScale() {
  return useContext(TextScaleContext);
}
