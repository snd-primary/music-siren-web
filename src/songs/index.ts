import type { Song } from './types';
import { IEJI } from './ieji';
import { BRAHMS_LULLABY } from './brahms-lullaby';

export { IEJI, BRAHMS_LULLABY };
export * from './types';

export const SONGS: readonly Song[] = [IEJI, BRAHMS_LULLABY];
