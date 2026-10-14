use crate::input::{Bounds, InputResult, validate_coordinate};
use std::sync::{OnceLock, mpsc};
use std::time::{Duration, Instant};

pub const LIMIT: usize = 50;
pub const VISIT_LIMIT: usize = 200;
#[cfg_attr(feature = "addon", napi_derive::napi(object))]
#[derive(Clone, Debug, PartialEq)]
pub struct UiElement {
    pub bounds: Bounds,
    pub role: String,
    pub name: String,
    pub is_enabled: bool,
    pub is_offscreen: bool,
    pub is_clickable: bool,
}
#[cfg_attr(feature = "addon", napi_derive::napi(object))]
#[derive(Clone, Debug, PartialEq)]
pub struct ForegroundApp {
    pub app_id: String,
    pub window_title: String,
}
pub trait UiBackend {
    fn near(&mut self, x: f64, y: f64, radius_px: f64, at: bool) -> InputResult<Vec<UiElement>>;
    fn foreground(&mut self) -> InputResult<ForegroundApp>;
}
#[derive(Clone)]
pub enum Query {
    Near {
        x: f64,
        y: f64,
        radius: f64,
        at: bool,
    },
    Foreground,
}
pub enum Reply {
    Elements(Vec<UiElement>),
    Foreground(ForegroundApp),
}
struct Request {
    query: Query,
    deadline: Instant,
    reply: mpsc::Sender<InputResult<Reply>>,
}
static WORKER: OnceLock<Result<mpsc::SyncSender<Request>, String>> = OnceLock::new();
// Called only from a napi AsyncTask compute worker, never the JavaScript thread.
pub fn query(query: Query) -> InputResult<Reply> {
    let worker = WORKER
        .get_or_init(|| {
            #[cfg(target_os = "macos")]
            let create = crate::macos::ui::PlatformUi::new;
            #[cfg(target_os = "windows")]
            let create = crate::windows::ui::PlatformUi::new;
            spawn_worker(create)
        })
        .as_ref()
        .map_err(Clone::clone)?;
    let (send, receive) = mpsc::channel();
    worker
        .try_send(Request {
            query,
            deadline: Instant::now() + Duration::from_millis(250),
            reply: send,
        })
        .map_err(|_| "Accessibility worker busy or stopped".to_string())?;
    receive
        .recv_timeout(Duration::from_millis(250))
        .map_err(|_| "Accessibility query timed out".to_string())?
}
fn spawn_worker<B: UiBackend + 'static>(
    create: impl FnOnce() -> InputResult<B> + Send + 'static,
) -> InputResult<mpsc::SyncSender<Request>> {
    let (send, receive) = mpsc::sync_channel::<Request>(1);
    std::thread::Builder::new()
        .name("gestura-accessibility".into())
        .spawn(move || {
            let mut backend = create();
            while let Ok(request) = receive.recv() {
                if Instant::now() >= request.deadline {
                    let _ = request
                        .reply
                        .send(Err("Accessibility query expired in queue".into()));
                    continue;
                }
                let result = match &mut backend {
                    Ok(backend) => match request.query {
                        Query::Near { x, y, radius, at } => {
                            backend.near(x, y, radius, at).map(|mut elements| {
                                elements.truncate(if at { 1 } else { LIMIT });
                                Reply::Elements(elements)
                            })
                        }
                        Query::Foreground => backend.foreground().map(Reply::Foreground),
                    },
                    Err(error) => Err(error.clone()),
                };
                let _ = request.reply.send(result);
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(send)
}
pub fn validate_query(x: f64, y: f64, radius: f64) -> InputResult<()> {
    validate_coordinate(x)?;
    validate_coordinate(y)?;
    if !radius.is_finite() || !(0.0..=10_000.0).contains(&radius) {
        return Err("Radius must be 0..10,000 physical pixels".into());
    }
    Ok(())
}
pub fn truncate_label(value: &str) -> String {
    let mut units = 0;
    value
        .chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= 4096
        })
        .collect()
}
pub fn intersects(bounds: &Bounds, x: f64, y: f64, radius: f64) -> bool {
    if ![bounds.x, bounds.y, bounds.width, bounds.height]
        .iter()
        .all(|n| n.is_finite())
        || bounds.width <= 0.0
        || bounds.height <= 0.0
    {
        return false;
    }
    let dx = (bounds.x - x).max(0.0).max(x - bounds.x - bounds.width);
    let dy = (bounds.y - y).max(0.0).max(y - bounds.y - bounds.height);
    dx.hypot(dy) <= radius
}
#[cfg(feature = "addon")]
pub mod addon {
    use super::*;
    use napi::{Env, Task, bindgen_prelude::AsyncTask};
    use napi_derive::napi;
    pub struct ElementsTask {
        query: Query,
        single: bool,
    }
    impl Task for ElementsTask {
        type Output = Vec<UiElement>;
        type JsValue = Vec<UiElement>;
        fn compute(&mut self) -> napi::Result<Self::Output> {
            match query(self.query.clone()).map_err(napi::Error::from_reason)? {
                Reply::Elements(mut elements) => {
                    elements.truncate(if self.single { 1 } else { LIMIT });
                    Ok(elements)
                }
                _ => Err(napi::Error::from_reason("Unexpected worker response")),
            }
        }
        fn resolve(&mut self, _: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
            Ok(output)
        }
    }
    // Option converts to null; the native elementAt task has its own result type.
    pub struct AtTask(ElementsTask);
    impl Task for AtTask {
        type Output = Option<UiElement>;
        type JsValue = Option<UiElement>;
        fn compute(&mut self) -> napi::Result<Self::Output> {
            Ok(self.0.compute()?.into_iter().next())
        }
        fn resolve(&mut self, _: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
            Ok(output)
        }
    }
    pub struct ForegroundTask;
    impl Task for ForegroundTask {
        type Output = ForegroundApp;
        type JsValue = ForegroundApp;
        fn compute(&mut self) -> napi::Result<Self::Output> {
            match query(Query::Foreground).map_err(napi::Error::from_reason)? {
                Reply::Foreground(app) => Ok(app),
                _ => Err(napi::Error::from_reason("Unexpected worker response")),
            }
        }
        fn resolve(&mut self, _: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
            Ok(output)
        }
    }
    #[napi]
    pub fn element_at(x: f64, y: f64) -> napi::Result<AsyncTask<AtTask>> {
        validate_query(x, y, 0.0).map_err(napi::Error::from_reason)?;
        Ok(AsyncTask::new(AtTask(ElementsTask {
            query: Query::Near {
                x,
                y,
                radius: 0.0,
                at: true,
            },
            single: true,
        })))
    }
    #[napi]
    pub fn elements_near(x: f64, y: f64, radius_px: f64) -> napi::Result<AsyncTask<ElementsTask>> {
        validate_query(x, y, radius_px).map_err(napi::Error::from_reason)?;
        Ok(AsyncTask::new(ElementsTask {
            query: Query::Near {
                x,
                y,
                radius: radius_px,
                at: false,
            },
            single: false,
        }))
    }
    #[napi]
    pub fn foreground_app() -> AsyncTask<ForegroundTask> {
        AsyncTask::new(ForegroundTask)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    struct FakeBackend(std::thread::ThreadId);
    impl UiBackend for FakeBackend {
        fn near(&mut self, _: f64, _: f64, _: f64, _: bool) -> InputResult<Vec<UiElement>> {
            assert_eq!(self.0, std::thread::current().id());
            Ok((0..60)
                .map(|i| UiElement {
                    bounds: Bounds {
                        x: 0.0,
                        y: 0.0,
                        width: 48.0,
                        height: 48.0,
                    },
                    role: "button".into(),
                    name: i.to_string(),
                    is_enabled: true,
                    is_offscreen: false,
                    is_clickable: true,
                })
                .collect())
        }
        fn foreground(&mut self) -> InputResult<ForegroundApp> {
            assert_eq!(self.0, std::thread::current().id());
            Ok(ForegroundApp {
                app_id: "mock".into(),
                window_title: format!("{:?}", self.0),
            })
        }
    }
    #[test]
    fn worker_owns_backend_caps_results_and_skips_expired_work() -> InputResult<()> {
        let worker = spawn_worker(|| Ok(FakeBackend(std::thread::current().id())))?;
        let request = |query, deadline| -> InputResult<Reply> {
            let (send, receive) = mpsc::channel();
            worker
                .send(Request {
                    query,
                    deadline,
                    reply: send,
                })
                .map_err(|e| e.to_string())?;
            receive
                .recv_timeout(Duration::from_secs(1))
                .map_err(|e| e.to_string())?
        };
        let deadline = || Instant::now() + Duration::from_secs(1);
        match request(Query::Foreground, deadline())? {
            Reply::Foreground(app) => assert_ne!(
                app.window_title,
                format!("{:?}", std::thread::current().id())
            ),
            _ => panic!("Wrong reply"),
        }
        for (at, count) in [(false, 50), (true, 1)] {
            match request(
                Query::Near {
                    x: 0.0,
                    y: 0.0,
                    radius: 10.0,
                    at,
                },
                deadline(),
            )? {
                Reply::Elements(elements) => assert_eq!(elements.len(), count),
                _ => panic!("Wrong reply"),
            }
        }
        assert!(request(Query::Foreground, Instant::now() - Duration::from_secs(1)).is_err());
        Ok(())
    }
    #[test]
    fn geometry_and_arguments() {
        let b = Bounds {
            x: 10.0,
            y: 10.0,
            width: 20.0,
            height: 20.0,
        };
        assert!(intersects(&b, 5.0, 10.0, 5.0));
        assert!(!intersects(&b, 5.0, 5.0, 5.0));
        assert!(intersects(&b, 15.0, 15.0, 0.0));
        assert!(validate_query(0.0, 0.0, f64::NAN).is_err());
        assert!(validate_query(0.0, 0.0, -1.0).is_err());
        assert_eq!(
            truncate_label(&"🐱".repeat(3000)).encode_utf16().count(),
            4096
        );
    }
}
