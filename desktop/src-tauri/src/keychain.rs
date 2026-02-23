use keyring::Entry;

/// Service name used as the keychain namespace for all Spectrus entries.
const SERVICE: &str = "com.spectrus.app";

/// Store `value` under `key` in the OS credential store.
#[tauri::command]
pub fn keychain_set(key: String, value: String) -> Result<(), String> {
    Entry::new(SERVICE, &key)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| e.to_string())
}

/// Retrieve the value stored under `key`, or `null` if it does not exist.
#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, &key).and_then(|e| e.get_password()) {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete the entry stored under `key`. Idempotent — succeeds even if the key
/// does not exist.
#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    match Entry::new(SERVICE, &key).and_then(|e| e.delete_credential()) {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone — that's fine
        Err(e) => Err(e.to_string()),
    }
}
