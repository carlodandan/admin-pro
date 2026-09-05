//! The Supabase REST client. Replaces `@supabase/supabase-js`, which used to run
//! in the Electron main process — so the session stays server-side here too,
//! held in memory exactly as `persistSession: false` did.
//!
//! Only the three surfaces the app actually used are implemented: GoTrue
//! (`signUp`, `signInWithPassword`), PostgREST (`from().select/insert/update`)
//! and RPC (`rpc()`).

pub mod sync;

use std::sync::{Arc, RwLock};

use serde_json::{json, Value};

use crate::error::AppError;

/// `VITE_*` names are kept so `.env`, the README and the release workflow all
/// keep working unchanged. Baked in at compile time when present, with a
/// `.env` fallback for `tauri dev`.
const BUILD_URL: Option<&str> = option_env!("VITE_SUPABASE_URL");
const BUILD_ANON_KEY: Option<&str> = option_env!("VITE_SUPABASE_ANON_KEY");

/// A GoTrue session. `user` is kept as raw JSON so the display name in
/// `user_metadata` reaches the caller. Nothing authorizes on that metadata — it
/// is user-editable, so the admin check lives in `app_admins` behind RLS.
#[derive(Clone, Debug)]
pub struct Session {
    pub access_token: String,
    pub user: Value,
}

impl Session {
    pub fn email(&self) -> Option<&str> {
        self.user.get("email").and_then(Value::as_str)
    }

    pub fn id(&self) -> Option<&str> {
        self.user.get("id").and_then(Value::as_str)
    }
}

/// A PostgREST or GoTrue failure. `status` and `code` are carried separately
/// because the original inspected both — though only `code` ever decided
/// anything (`error.code !== '42P01'`); its one `status` check was misspelled
/// `error.stats` and never matched.
#[derive(Debug, Clone)]
pub struct ApiError {
    #[allow(dead_code)]
    pub status: u16,
    pub message: String,
    pub code: Option<String>,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

impl From<ApiError> for AppError {
    fn from(value: ApiError) -> Self {
        AppError::Message(value.message)
    }
}

impl From<reqwest::Error> for ApiError {
    fn from(value: reqwest::Error) -> Self {
        ApiError {
            status: value.status().map(|s| s.as_u16()).unwrap_or(0),
            message: value.to_string(),
            code: None,
        }
    }
}

type ApiResult<T> = std::result::Result<T, ApiError>;

pub struct Supabase {
    url: String,
    anon_key: String,
    http: reqwest::Client,
    session: RwLock<Option<Session>>,
}

impl Supabase {
    /// `None` when either variable is missing, which is how the Electron build
    /// behaved: `supabase.js` logged a warning and exported `null`, and every
    /// call site guarded with `if (this.supabase)`.
    pub fn from_env() -> Option<Arc<Self>> {
        let url = env_value("VITE_SUPABASE_URL", BUILD_URL)?;
        let anon_key = env_value("VITE_SUPABASE_ANON_KEY", BUILD_ANON_KEY)?;

        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .ok()?;

        Some(Arc::new(Self {
            url: url.trim_end_matches('/').to_string(),
            anon_key,
            http,
            session: RwLock::new(None),
        }))
    }

    fn read_session(&self) -> Option<Session> {
        self.session
            .read()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone()
    }

    fn store_session(&self, session: Option<Session>) {
        *self
            .session
            .write()
            .unwrap_or_else(|poison| poison.into_inner()) = session;
    }

    /// `supabase.auth.getSession()` — the sync gate.
    pub fn session(&self) -> Option<Session> {
        self.read_session()
    }

    /// The bearer token PostgREST should see: the signed-in user's if there is
    /// one, otherwise the anon key (which is what supabase-js sends).
    fn bearer(&self) -> String {
        self.read_session()
            .map(|session| session.access_token)
            .unwrap_or_else(|| self.anon_key.clone())
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}{path}", self.url))
            .header("apikey", &self.anon_key)
            .header("Authorization", format!("Bearer {}", self.bearer()))
    }
}

/// Reads a compile-time value first, then the process environment (which
/// `dotenvy` will have populated from `.env` during `tauri dev`).
fn env_value(name: &str, baked: Option<&str>) -> Option<String> {
    let value = baked
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var(name).ok())?;

    let value = value.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// Turns a response into JSON, or into the closest thing to a supabase-js
/// error object. GoTrue and PostgREST disagree on the field names, so all four
/// spellings are checked.
async fn parse(response: reqwest::Response) -> ApiResult<Value> {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let json: Value = serde_json::from_str(&body).unwrap_or(Value::Null);

    if status.is_success() {
        return Ok(json);
    }

    let text = |key: &str| json.get(key).and_then(Value::as_str).map(str::to_string);
    let message = text("message")
        .or_else(|| text("msg"))
        .or_else(|| text("error_description"))
        .or_else(|| text("error"))
        .unwrap_or_else(|| {
            if body.is_empty() {
                status.to_string()
            } else {
                body.clone()
            }
        });

    Err(ApiError {
        status: status.as_u16(),
        message,
        code: text("code").or_else(|| text("error_code")),
    })
}

impl Supabase {
    /// `supabase.auth.signUp({ email, password, options: { data } })`.
    /// Returns the new user's id when GoTrue reports one.
    pub async fn sign_up(
        &self,
        email: &str,
        password: &str,
        metadata: Value,
    ) -> ApiResult<Option<String>> {
        let body = parse(
            self.request(reqwest::Method::POST, "/auth/v1/signup")
                .json(&json!({ "email": email, "password": password, "data": metadata }))
                .send()
                .await?,
        )
        .await?;

        // With confirmations off GoTrue returns a session wrapping the user;
        // with them on it returns the bare user.
        let user = body.get("user").filter(|value| !value.is_null()).unwrap_or(&body);
        Ok(user
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string))
    }

    /// `supabase.auth.signInWithPassword({ email, password })`. On success the
    /// session is stored for the rest of the process lifetime.
    pub async fn sign_in_with_password(&self, email: &str, password: &str) -> ApiResult<Session> {
        let body = parse(
            self.request(
                reqwest::Method::POST,
                "/auth/v1/token?grant_type=password",
            )
            .json(&json!({ "email": email, "password": password }))
            .send()
            .await?,
        )
        .await?;

        let access_token = body
            .get("access_token")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let user = body.get("user").cloned().unwrap_or(Value::Null);

        if access_token.is_empty() || user.is_null() {
            return Err(ApiError {
                status: 0,
                message: "Supabase returned no session".to_string(),
                code: None,
            });
        }

        let session = Session { access_token, user };
        self.store_session(Some(session.clone()));
        Ok(session)
    }

    /// `supabase.rpc(name, params)`.
    pub async fn rpc(&self, name: &str, params: Value) -> ApiResult<Value> {
        parse(
            self.request(reqwest::Method::POST, &format!("/rest/v1/rpc/{name}"))
                .json(&params)
                .send()
                .await?,
        )
        .await
    }
}

impl Supabase {
    /// `from(table).select(columns)` plus optional `eq()` filters, which is the
    /// only filter form the sync code and `verifyAdminLogin` used.
    pub async fn select(
        &self,
        table: &str,
        columns: &str,
        filters: &[(&str, String)],
    ) -> ApiResult<Vec<Value>> {
        let mut request = self
            .request(reqwest::Method::GET, &format!("/rest/v1/{table}"))
            .query(&[("select", columns)]);
        for (column, value) in filters {
            request = request.query(&[(*column, format!("eq.{value}"))]);
        }

        let body = parse(request.send().await?).await?;
        Ok(match body {
            Value::Array(rows) => rows,
            Value::Null => Vec::new(),
            row => vec![row],
        })
    }

    /// `from(table).insert(payload)`; `.select()` is appended when the caller
    /// needs the inserted row back (the departments push reads its new id).
    pub async fn insert(&self, table: &str, payload: &Value, returning: bool) -> ApiResult<Vec<Value>> {
        let prefer = if returning {
            "return=representation"
        } else {
            "return=minimal"
        };

        let body = parse(
            self.request(reqwest::Method::POST, &format!("/rest/v1/{table}"))
                .header("Content-Type", "application/json")
                .header("Prefer", prefer)
                .json(payload)
                .send()
                .await?,
        )
        .await?;

        Ok(match body {
            Value::Array(rows) => rows,
            Value::Null => Vec::new(),
            row => vec![row],
        })
    }

    /// `from(table).update(payload).eq(column, value)`.
    pub async fn update(
        &self,
        table: &str,
        payload: &Value,
        filters: &[(&str, String)],
    ) -> ApiResult<()> {
        let mut request = self
            .request(reqwest::Method::PATCH, &format!("/rest/v1/{table}"))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal");
        for (column, value) in filters {
            request = request.query(&[(*column, format!("eq.{value}"))]);
        }

        parse(request.json(payload).send().await?).await?;
        Ok(())
    }
}



impl Supabase {
    /// `supabase.auth.updateUser({ password })`. Requires the signed-in user's
    /// JWT, which is the whole point: only someone holding a live session can
    /// rotate the password, and GoTrue — not this app — stores the result.
    pub async fn update_user_password(&self, password: &str) -> ApiResult<()> {
        parse(
            self.request(reqwest::Method::PUT, "/auth/v1/user")
                .json(&json!({ "password": password }))
                .send()
                .await?,
        )
        .await?;
        Ok(())
    }

    /// `supabase.auth.resetPasswordForEmail(email)` — the only way to set a new
    /// password without knowing the old one, because nothing local holds a
    /// credential any more. Needs project SMTP to actually deliver.
    pub async fn send_recovery_email(&self, email: &str) -> ApiResult<()> {
        parse(
            self.request(reqwest::Method::POST, "/auth/v1/recover")
                .json(&json!({ "email": email }))
                .send()
                .await?,
        )
        .await?;
        Ok(())
    }

    /// Take the session out of this client, returning what was there.
    ///
    /// Signing out has two halves that must not share a failure mode: forgetting
    /// the token here, which cannot fail, and revoking it at GoTrue, which needs
    /// the network. This is the first half, and it hands the caller what the
    /// second half needs.
    pub fn take_session(&self) -> Option<Session> {
        let session = self.read_session();
        self.store_session(None);
        session
    }

    /// `supabase.auth.signOut()` — revoke one refresh token, by its own access
    /// token rather than by whatever this client currently holds, because
    /// `take_session` has already cleared that.
    pub async fn revoke(&self, access_token: &str) -> ApiResult<()> {
        parse(
            self.http
                .request(
                    reqwest::Method::POST,
                    format!("{}/auth/v1/logout", self.url),
                )
                .header("apikey", &self.anon_key)
                .header("Authorization", format!("Bearer {access_token}"))
                .json(&json!({}))
                .send()
                .await?,
        )
        .await?;
        Ok(())
    }
}
