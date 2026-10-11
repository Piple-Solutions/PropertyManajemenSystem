import { createContext, useContext } from 'react';

/** Tone of the content that sits directly under the fixed public header. */
export type HeaderTone = 'light' | 'dark';

interface PublicContextValue {
  /** Scroll reveal / entrance motion is active (IntersectionObserver present, motion allowed). */
  enhanced: boolean;
  tone: HeaderTone;
  setTone: (tone: HeaderTone) => void;
  /** The routed page has been committed: the layout may now load header and footer. */
  markReady: () => void;
}

const PublicContext = createContext<PublicContextValue>({
  enhanced: false,
  tone: 'light',
  setTone: () => undefined,
  markReady: () => undefined,
});

export const PublicProvider = PublicContext.Provider;

export function usePublic(): PublicContextValue {
  return useContext(PublicContext);
}
