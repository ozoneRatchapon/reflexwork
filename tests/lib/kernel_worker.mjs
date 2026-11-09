// The real kernel worker for tests. It imports its Rust rules as a .wasm module (Workers style), so the hook must be in place first.
import { register } from 'node:module';
register('./wasm_module_hook.mjs', import.meta.url);
const { default: worker } = await import('../../integrations/kernel-worker/worker.mjs');
export default worker;
