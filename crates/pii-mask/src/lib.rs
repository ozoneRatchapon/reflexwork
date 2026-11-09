//! One personal-data mask for every copy of a question that leaves the browser or a worker: the page (through reflex-wasm),
//! the kernel worker (gap list) and the LINE worker (AI proxy, gap list). Built for the workers by `build.sh`.
mod mask;
mod types;

pub use mask::mask_pii;
pub use types::PiiKind;

/// Wasm export for the workers (the page gets the same function from reflex-wasm).
#[cfg(feature = "worker")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name = mask_pii)]
pub fn mask_pii_js(text: &str) -> String {
    mask::mask_pii(text)
}
