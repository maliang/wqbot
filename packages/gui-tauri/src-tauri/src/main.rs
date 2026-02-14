#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Mutex;
use tauri::api::process::{Command, CommandChild, CommandEvent};
use tauri::Manager;

struct BackendProcess(Mutex<Option<CommandChild>>);

fn start_backend() -> Option<CommandChild> {
    println!("[wqbot] 正在启动后端 sidecar...");

    let (mut rx, child) = Command::new_sidecar("wqbot-backend")
        .expect("failed to create wqbot-backend sidecar")
        .args(["--port", "3721", "--host", "127.0.0.1"])
        .spawn()
        .expect("failed to spawn wqbot-backend sidecar");

    let pid = child.pid();
    println!("[wqbot] 后端 sidecar 已启动 (PID: {})", pid);

    // 异步读取 stdout/stderr 用于日志
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("[backend] {}", line),
                CommandEvent::Stderr(line) => eprintln!("[backend] {}", line),
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[wqbot] 后端进程已退出 (code: {:?}, signal: {:?})",
                        payload.code, payload.signal
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Some(child)
}

fn stop_backend(process: &Mutex<Option<CommandChild>>) {
    if let Ok(mut guard) = process.lock() {
        if let Some(child) = guard.take() {
            println!("[wqbot] 正在停止后端 sidecar...");
            let _ = child.kill();
            println!("[wqbot] 后端 sidecar 已停止");
        }
    }
}

#[tauri::command]
fn check_backend_status() -> bool {
    std::net::TcpStream::connect("127.0.0.1:3721").is_ok()
}

#[tauri::command]
fn restart_backend(state: tauri::State<BackendProcess>) -> bool {
    stop_backend(&state.0);
    std::thread::sleep(std::time::Duration::from_millis(500));

    if let Some(child) = start_backend() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(child);
            return true;
        }
    }
    false
}

#[tauri::command]
fn get_backend_info() -> String {
    let status = if check_backend_status() { "运行中" } else { "未运行" };
    format!(
        "平台: {}\n架构: {}\n后端状态: {}\n模式: sidecar\n",
        std::env::consts::OS,
        std::env::consts::ARCH,
        status
    )
}

fn main() {
    let backend_child = start_backend();

    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(backend_child)))
        .invoke_handler(tauri::generate_handler![
            check_backend_status,
            restart_backend,
            get_backend_info
        ])
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                if let Some(state) = event.window().try_state::<BackendProcess>() {
                    stop_backend(&state.0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
