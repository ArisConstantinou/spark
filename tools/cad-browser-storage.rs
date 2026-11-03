/// Storage APIs are optional even in a secure browser context. Reflect and
/// Function::call0 catch synchronous getter/method exceptions before awaiting;
/// a web-sys get_directory binding can otherwise throw outside Rust's Result.
async fn storage_request(name: &str) -> Result<wasm_bindgen::JsValue, String> {
    let window = web_sys::window().ok_or_else(|| "browser window unavailable".to_string())?;
    let storage = js_sys::Reflect::get(window.navigator().as_ref(), &"storage".into())
        .map_err(js_error)?;
    if storage.is_null() || storage.is_undefined() {
        return Err("Origin-private storage is unavailable".to_string());
    }
    let method = js_sys::Reflect::get(&storage, &name.into())
        .map_err(js_error)?
        .dyn_into::<js_sys::Function>()
        .map_err(|_| "Origin-private storage is unavailable".to_string())?;
    let promise = method.call0(&storage)
        .map_err(js_error)?
        .dyn_into::<js_sys::Promise>()
        .map_err(js_error)?;
    JsFuture::from(promise).await.map_err(js_error)
}

pub(crate) async fn storage_root() -> Result<web_sys::FileSystemDirectoryHandle, String> {
    storage_request("getDirectory").await?
        .dyn_into::<web_sys::FileSystemDirectoryHandle>().map_err(js_error)
}

/// A denied or missing persistence request must never poison the async runner.
pub(crate) async fn request_persistence() {
    let _ = storage_request("persist").await;
}
