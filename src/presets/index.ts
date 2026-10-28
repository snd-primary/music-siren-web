import type { MachineSpec } from '../mechanism/machine';
import { IGA_8 } from './iga-8';
import { MODEL_10A } from './10a';
import { MODEL_10B } from './10b';
import { MODEL_12A } from './12a';
import { MODEL_12C } from './12c';

export { IGA_8, MODEL_10A, MODEL_10B, MODEL_12A, MODEL_12C };

/** 取扱説明書「サイレン種類及び其の配列表」の全機種。先頭が基準プリセット。 */
export const PRESETS: readonly MachineSpec[] = [IGA_8, MODEL_10A, MODEL_10B, MODEL_12A, MODEL_12C];
