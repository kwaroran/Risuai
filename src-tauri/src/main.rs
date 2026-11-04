// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use oauth2::basic::BasicClient;
use oauth2::{
    AuthorizationCode,
    AuthUrl,
    ClientId,
    ClientSecret,
    CsrfToken,
    PkceCodeChallenge,
    RedirectUrl,
    Scope,
    TokenResponse,
    TokenUrl
};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;
use std::sync::{Arc, Mutex};
use tauri::{Listener, Manager};
use tauri::{AppHandle, Emitter};

#[tauri::command]
async fn native_request(url: String, body: String, header: String, method: String) -> String {
    let headers_json: Value = match serde_json::from_str(&header) {
        Ok(h) => h,
        Err(e) => return format!(r#"{{"success":false,"body":"{}"}}"#, e.to_string()),
    };

    let mut headers = HeaderMap::new();
    let method = method.to_string();
    if let Some(obj) = headers_json.as_object() {
        for (key, value) in obj {
            let header_name = match HeaderName::from_bytes(key.as_bytes()) {
                Ok(name) => name,
                Err(e) => return format!(r#"{{"success":false,"body":"{}"}}"#, e.to_string()),
            };
            let header_value = match HeaderValue::from_str(value.as_str().unwrap_or("")) {
                Ok(value) => value,
                Err(e) => return format!(r#"{{"success":false,"body":"{}"}}"#, e.to_string()),
            };
            headers.insert(header_name, header_value);
        }
    } else {
        return format!(r#"{{"success":false,"body":"Invalid header JSON"}}"#);
    }

    let client = reqwest::Client::new();
    let response: Result<reqwest::Response, reqwest::Error>;

    if method == "POST" {
        response = client
            .post(&url)
            .headers(headers)
            .timeout(Duration::from_secs(120))
            .body(body)
            .send()
            .await;
    } else {
        response = client
            .get(&url)
            .headers(headers)
            .timeout(Duration::from_secs(120))
            .send()
            .await;
    }

    match response {
        Ok(resp) => {
            let headers = resp.headers();
            let header_json = header_map_to_json(headers);
            let status = resp.status().as_u16().to_string();
            let bytes = match resp.bytes().await {
                Ok(b) => b,
                Err(e) => return format!(r#"{{"success":false,"body":"{}"}}"#, e.to_string()),
            };
            let encoded = general_purpose::STANDARD.encode(&bytes);

            format!(
                // r#"{{"success":true,"body":"{}","headers":{}}}"#,
                r#"{{"success":true,"body":"{}","headers":{},"status":{}}}"#,
                encoded, header_json, status
            )
        }
        Err(e) => format!(r#"{{"success":false,"body":"{}","status":400}}"#, e.to_string()),
    }
}

use oauth2::{
    EmptyExtraTokenFields, EndpointNotSet, EndpointSet, RevocationErrorResponseType,
    StandardErrorResponse, StandardRevocableToken, StandardTokenIntrospectionResponse,
    StandardTokenResponse,
};

use oauth2::basic::{
    BasicErrorResponseType, BasicTokenType,
};

fn get_oauth_client() -> oauth2::Client<StandardErrorResponse<BasicErrorResponseType>, StandardTokenResponse<EmptyExtraTokenFields, BasicTokenType>, StandardTokenIntrospectionResponse<EmptyExtraTokenFields, BasicTokenType>, StandardRevocableToken, StandardErrorResponse<RevocationErrorResponseType>, EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet> {
    let auth_url = AuthUrl::new("http://authorize".to_string()).unwrap();
    let token_url = TokenUrl::new("http://token".to_string()).unwrap();
    let redirection_url = RedirectUrl::new("http://redirect".to_string()).unwrap();
    let client = BasicClient::new(ClientId::new("client_id".to_string()))
        .set_client_secret(ClientSecret::new("client_secret".to_string()))
        .set_auth_uri(auth_url)
        .set_token_uri(token_url)
        // Set the URL the user will be redirected to after the authorization process.
        .set_redirect_uri(redirection_url);

    return client;
}


#[tauri::command]
async fn oauth_login(app: AppHandle) -> Result<String, String> {

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let client = get_oauth_client();
    // Write pkce_verifier to a file or session for later use.
    std::fs::write("pkce_verifier.txt", pkce_verifier.secret()).unwrap();

    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        // Set the desired scopes.
        .add_scope(Scope::new("read".to_string()))
        .add_scope(Scope::new("write".to_string()))
        // Set the PKCE code challenge.
        .set_pkce_challenge(pkce_challenge)
        .url();

    let http_client = oauth2::reqwest::ClientBuilder::new()
        // Following redirects opens the client up to SSRF vulnerabilities.
        .redirect(oauth2::reqwest::redirect::Policy::none())
        .build()
        .expect("Client should build");

    app.emit("oauth_open_url",auth_url.to_string()).unwrap();

    let auth_code = Arc::new(Mutex::new(String::new()));
    let auth_code_clone = Arc::clone(&auth_code);

    let handle = app.app_handle().clone();
    //promise
    app.listen("oauth_callback_event", move |event| {
        // Handle the event
        let mut code = auth_code_clone.lock().unwrap();
        *code = event.payload().to_string();
        handle.unlisten(event.id());
    });

    //wait for auth_code to be set
    loop {
        {
            let code = auth_code.lock().unwrap();
            if !code.is_empty() {
                break;
            }
        } // MutexGuard is dropped here before await
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // Now you can trade it for an access token.
    let auth_code_value = auth_code.lock().unwrap().clone();
    let token_result = client
        .exchange_code(AuthorizationCode::new(auth_code_value))
        // Set the PKCE code verifier.
        .set_pkce_verifier(pkce_verifier)
        .request_async(&http_client)
        .await;


    return Ok(token_result.unwrap().access_token().secret().to_string());
}

#[tauri::command]
async fn streamed_fetch(
    id: String,
    url: String,
    headers: String,
    body: String,
    app: AppHandle,
    method: String,
    timeout_secs: Option<u64>,
) -> String {
    //parse headers
    let headers_json: Value = match serde_json::from_str(&headers) {
        Ok(h) => h,
        Err(e) => return format!(r#"{{"success":false, body:{}}}"#, e.to_string()),
    };

    let mut headers = HeaderMap::new();
    if let Some(obj) = headers_json.as_object() {
        for (key, value) in obj {
            let header_name = match HeaderName::from_bytes(key.as_bytes()) {
                Ok(name) => name,
                Err(e) => return format!(r#"{{"success":false, body:{}}}"#, e.to_string()),
            };
            let header_value = match HeaderValue::from_str(value.as_str().unwrap_or("")) {
                Ok(value) => value,
                Err(e) => return format!(r#"{{"success":false, body:{}}}"#, e.to_string()),
            };
            headers.insert(header_name, header_value);
        }
    } else {
        return format!(r#"{{"success":false,"body":"Invalid header JSON"}}"#);
    }

    let client = reqwest::Client::new();
    let timeout_secs = timeout_secs.unwrap_or(240);
    let builder: reqwest::RequestBuilder;
    if method == "POST" {

        let body_decoded = general_purpose::STANDARD.decode(body.as_bytes()).unwrap();

        builder = client
        .post(&url)
        .headers(headers)
        .timeout(Duration::from_secs(timeout_secs))
        .body(body_decoded)
    }
    else if method == "GET" {
        builder = client
        .get(&url)
        .headers(headers)
        .timeout(Duration::from_secs(timeout_secs));
    }
    else if method == "PUT" {

        let body_decoded = general_purpose::STANDARD.decode(body.as_bytes()).unwrap();

        builder = client
        .put(&url)
        .headers(headers)
        .timeout(Duration::from_secs(timeout_secs))
        .body(body_decoded)
    }
    else if method == "DELETE" {

        let body_decoded = general_purpose::STANDARD.decode(body.as_bytes()).unwrap();

        builder = client
        .delete(&url)
        .headers(headers)
        .timeout(Duration::from_secs(timeout_secs))
        .body(body_decoded)
    }
    else {
        return format!(r#"{{"success":false, body:"Invalid method"}}"#);
    }



    let response = builder
        .send()
        .await;

    match response {
        Ok(mut resp) => {
            let headers = resp.headers();
            let header_json = header_map_to_json(headers);
            app.emit(
                "streamed_fetch",
                &format!(
                    r#"{{"type": "headers", "body": {}, "id": "{}", "status": {}}}"#,
                    header_json,
                    id,
                    resp.status().as_u16()
                ),
            )
            .unwrap();
            loop {
                let byt = resp.chunk().await;
                match byt {
                    Ok(chunk) => {
                        if chunk.is_none() {
                            break;
                        }
                        let chunk = chunk.unwrap();
                        let encoded = general_purpose::STANDARD.encode(chunk);
                        let emited = app.emit(
                            "streamed_fetch",
                            &format!(
                                r#"{{"type": "chunk", "body": "{}", "id": "{}"}}"#,
                                encoded, id
                            ),
                        );

                        match emited {
                            Ok(_) => {}
                            Err(e) => {
                                return format!(r#"{{"success":false, body:{}}}"#, e.to_string())
                            }
                        }
                    }
                    Err(e) => return format!(r#"{{"success":false, body:{}}}"#, e.to_string()),
                }
            }
            app.emit(
                "streamed_fetch",
                &format!(r#"{{"type": "end", "id": "{}"}}"#, id),
            )
            .unwrap();
            return "{\"success\":true}".to_string();
        }
        Err(e) => return format!(r#"{{"success":false, body:{}}}"#, e.to_string()),
    }
}


fn main() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }));
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            native_request,
            streamed_fetch,
            oauth_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

fn header_map_to_json(header_map: &HeaderMap) -> serde_json::Value {
    let mut map = HashMap::new();
    for (key, value) in header_map {
        map.insert(
            key.as_str().to_string(),
            value.to_str().unwrap().to_string(),
        );
    }
    json!(map)
}
