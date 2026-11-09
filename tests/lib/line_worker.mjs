// The real LINE worker for tests (it imports the Rust mask as a .wasm module, Workers style): the hook goes in first.
import { register } from 'node:module';
register('./wasm_module_hook.mjs', import.meta.url);
const mod = await import('../../integrations/line-worker/worker.mjs');
export default mod.default;
export const notInManualText = mod.notInManualText;
