// ReflexWork — the Graduate School's LINE worker (Cloudflare Workers). The app is app.mjs `makeWorker` (any manual, plan 019 item 6.4);
// this entry gives it the Graduate School's manual (kb-data.mjs, regenerate: node scripts/gen_line_kb.mjs). Deploy notes: app.mjs.
import * as MANUAL from './kb-data.mjs';
import { makeWorker, todayBangkok, lineState } from './app.mjs';

// Built ONCE per isolate, at module scope (the Router, ~10 ms startup CPU)
const APP = makeWorker(MANUAL);
export { todayBangkok, lineState };
export const { decideLine, nearTitles, notInManualText } = APP;
export default APP.worker;
