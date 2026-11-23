import type { Song } from './types';
import { IEJI } from './ieji';
import { BRAHMS_LULLABY } from './brahms-lullaby';
import { FURUSATO } from './furusato';

export { IEJI, BRAHMS_LULLABY, FURUSATO };
export * from './types';

export const SONGS: readonly Song[] = [IEJI, FURUSATO, BRAHMS_LULLABY];
