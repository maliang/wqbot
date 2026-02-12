#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::path::PathBuf;
use std::env;
use tauri::Manager;

// 后端进程管理
struct BackendProcess(Mutex<Option<Child>>);

// 获取资源目录
fn get_resource_dir() -> Option<PathBuf> {
    // 尝试获取 Tauri 资源目录
    if let Ok(exe_path) = env::current_exe() {
        let exe_dir = exe_path.parent()?;

        // Windows: 资源在 exe 同级目录
        #[cfg(target_os = "windows")]
        {
            let resource_dir = exe_dir.join("resources");
            if resource_dir.exists() {
                return Some(resource_dir);
            }
        }

        // macOS: 资源在 .app/Contents/Resources
        #[cfg(target_os = "macos")]
        {
            let resource_dir = exe_dir.parent()?.join("Resources");
            if resource_dir.exists() {
                return Some(resource_dir);
            }
        }

        // Linux: 资源在 exe 同级目录或 /usr/share/wqbot
        #[cfg(target_os = "linux")]
        {
            let resource_dir = exe_dir.join("resources");
            if resource_dir.exists() {
                return Some(resource_dir);
            }
            let system_resource = PathBuf::from("/usr/share/wqbot/resources");
            if system_resource.exists() {
                return Some(system_resource);
            }
        }
    }

    None
}

// 查找 Node.js 可执行文件
fn find_node() -> Option<String> {
    // 常见的 Node.js 路径
    let node_paths = if cfg!(target_os = "windows") {
        vec![
            "node.exe",
            "C:\\Program Files\\nodejs\\node.exe",
            "C:\\Program Files (x86)\\nodejs\\node.exe",
        ]
    } else {
        vec![
            "node",
            "/usr/local/bin/node",
            "/usr/bin/node",
            "/opt/homebrew/bin/node",
        ]
    };

    for node_path in node_paths {
        let result = if cfg!(target_os = "windows") {
            Command::new("where").arg(node_path).output()
        } else {
            Command::new("which").arg(node_path).output()
        };

        if let Ok(output) = result {
            if output.status.success() {
                return Some(node_path.to_string());
            }
        }

        // 直接检查路径是否存在
        if std::path::Path::new(node_path).exists() {
            return Some(node_path.to_string());
        }
    }

    None
}

// 启动后端服务
fn start_backend() -> Option<Child> {
    println!("正在启动后端服务...");

    // 方式 1: 尝试使用全局安装的 wqbot CLI
    let global_commands = if cfg!(target_os = "windows") {
        vec![
            ("cmd", vec!["/C", "wqbot", "serve"]),
            ("cmd", vec!["/C", "npx", "wqbot", "serve"]),
        ]
    } else {
        vec![
            ("wqbot", vec!["serve"]),
            ("npx", vec!["wqbot", "serve"]),
        ]
    };

    for (cmd, args) in global_commands {
        match Command::new(cmd)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => {
                println!("后端服务已启动 (全局 CLI, PID: {})", child.id());
                return Some(child);
            }
            Err(e) => {
                println!("尝试全局 CLI 失败: {}", e);
            }
        }
    }

    // 方式 2: 尝试使用内嵌资源
    if let Some(resource_dir) = get_resource_dir() {
        println!("尝试使用内嵌资源: {:?}", resource_dir);

        if let Some(node) = find_node() {
            // 查找后端入口文件
            let backend_entry = resource_dir
                .join("packages")
                .join("backend")
                .join("dist")
                .join("index.js");

            if backend_entry.exists() {
                match Command::new(&node)
                    .arg(&backend_entry)
                    .current_dir(&resource_dir)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    Ok(child) => {
                        println!("后端服务已启动 (内嵌资源, PID: {})", child.id());
                        return Some(child);
                    }
                    Err(e) => {
                        println!("启动内嵌后端失败: {}", e);
                    }
                }
            } else {
                println!("后端入口文件不存在: {:?}", backend_entry);
            }
        } else {
            println!("未找到 Node.js，无法启动内嵌后端");
        }
    }

    println!("警告: 无法启动后端服务");
    println!("请确保已安装 WQBot CLI (npm install -g wqbot) 或 Node.js 环境可用");
    None
}

// 停止后端服务
fn stop_backend(process: &Mutex<Option<Child>>) {
    if let Ok(mut guard) = process.lock() {
        if let Some(mut child) = guard.take() {
            println!("正在停止后端服务 (PID: {})...", child.id());

            // 尝试优雅关闭
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/PID", &child.id().to_string(), "/T"])
                    .output();
            }

            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("kill")
                    .args(["-TERM", &child.id().to_string()])
                    .output();
            }

            // 等待进程结束
            let _ = child.wait();
            println!("后端服务已停止");
        }
    }
}

// 检查后端是否运行
#[tauri::command]
fn check_backend_status() -> bool {
    match std::net::TcpStream::connect("127.0.0.1:3721") {
        Ok(_) => true,
        Err(_) => false,
    }
}

// 重启后端
#[tauri::command]
fn restart_backend(state: tauri::State<BackendProcess>) -> bool {
    stop_backend(&state.0);

    // 等待端口释放
    std::thread::sleep(std::time::Duration::from_millis(500));

    if let Some(child) = start_backend() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(child);
            return true;
        }
    }
    false
}

// 获取后端日志
#[tauri::command]
fn get_backend_info() -> String {
    let mut info = String::new();

    info.push_str(&format!("平台: {}\n", std::env::consts::OS));
    info.push_str(&format!("架构: {}\n", std::env::consts::ARCH));

    if let Some(resource_dir) = get_resource_dir() {
        info.push_str(&format!("资源目录: {:?}\n", resource_dir));
    } else {
        info.push_str("资源目录: 未找到\n");
    }

    if let Some(node) = find_node() {
        info.push_str(&format!("Node.js: {}\n", node));
    } else {
        info.push_str("Node.js: 未找到\n");
    }

    let status = if check_backend_status() { "运行中" } else { "未运行" };
    info.push_str(&format!("后端状态: {}\n", status));

    info
}

fn main() {
    // 启动后端服务
    let backend_child = start_backend();

    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(backend_child)))
        .invoke_handler(tauri::generate_handler![
            check_backend_status,
            restart_backend,
            get_backend_info
        ])
        .on_window_event(|event| {
            // 窗口关闭时停止后端
            if let tauri::WindowEvent::Destroyed = event.event() {
                if let Some(state) = event.window().try_state::<BackendProcess>() {
                    stop_backend(&state.0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
