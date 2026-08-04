use std::{
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use image::{DynamicImage, GrayImage, ImageFormat, Luma};
use serde::{Serialize, de::DeserializeOwned};
use tauri::{AppHandle, Manager};

use crate::buff_assistant::detector::TemplateData;

const CONFIG_FILE: &str = "config-v1.json";
const TEMPLATE_FILE: &str = "template.png";
const MASK_FILE: &str = "mask.png";
const MAX_ASSET_ID_LENGTH: usize = 128;
static TEMPORARY_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub fn storage_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("visual-workflow"))
        .map_err(|error| format!("无法确定视觉流程配置目录：{error}"))
}

pub fn load_config<T: DeserializeOwned>(directory: &Path) -> Result<Option<T>, String> {
    load_json(&directory.join(CONFIG_FILE), "视觉流程配置")
}

pub fn save_config<T: Serialize>(directory: &Path, value: &T) -> Result<(), String> {
    let mut contents = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("序列化视觉流程配置失败：{error}"))?;
    contents.push(b'\n');
    atomic_write(&directory.join(CONFIG_FILE), &contents, "视觉流程配置")
}

pub fn load_json<T: DeserializeOwned>(path: &Path, label: &str) -> Result<Option<T>, String> {
    let contents = match fs::read(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("读取{label}失败：{error}")),
    };
    serde_json::from_slice(&contents)
        .map(Some)
        .map_err(|error| format!("解析{label}失败：{error}"))
}

pub fn save_template(
    directory: &Path,
    asset_id: &str,
    image: &DynamicImage,
    mask: Option<&GrayImage>,
) -> Result<(), String> {
    validate_asset_id(asset_id)?;
    let gray = image.to_luma8();
    let effective_mask = mask
        .cloned()
        .unwrap_or_else(|| GrayImage::from_pixel(gray.width(), gray.height(), Luma([255])));
    TemplateData::new(gray, effective_mask)
        .map_err(|error| format!("视觉流程模板无效：{error}"))?;

    let image_png = encode_png(image).map_err(|error| format!("编码模板图片失败：{error}"))?;
    let mask_png = mask
        .map(|value| encode_png(&DynamicImage::ImageLuma8(value.clone())))
        .transpose()
        .map_err(|error| format!("编码模板遮罩失败：{error}"))?;

    let target = template_directory(directory, asset_id)?;
    fs::create_dir_all(&target).map_err(|error| format!("创建模板目录失败：{error}"))?;
    if let Some(mask_png) = mask_png {
        // Commit the image last so a concurrently loaded pair never sees a new image with an old mask.
        atomic_write(&target.join(MASK_FILE), &mask_png, "视觉流程模板遮罩")?;
    }
    atomic_write(&target.join(TEMPLATE_FILE), &image_png, "视觉流程模板图片")?;
    if mask.is_none() {
        remove_file_if_exists(&target.join(MASK_FILE))?;
    }
    Ok(())
}

/// Loads a template bundle. A separate mask asset can be selected; otherwise a mask stored beside
/// the template is used when present, falling back to a fully enabled mask.
pub fn load_template(
    directory: &Path,
    asset_id: &str,
    mask_asset_id: Option<&str>,
) -> Result<TemplateData, String> {
    let target = template_directory(directory, asset_id)?;
    let image = image::open(target.join(TEMPLATE_FILE))
        .map_err(|error| format!("读取视觉流程模板图片失败：{error}"))?
        .into_luma8();

    let mask_path = match mask_asset_id {
        Some(mask_asset_id) => template_directory(directory, mask_asset_id)?.join(MASK_FILE),
        None => target.join(MASK_FILE),
    };
    let mask = match image::open(&mask_path) {
        Ok(mask) => mask.into_luma8(),
        Err(image::ImageError::IoError(error))
            if error.kind() == std::io::ErrorKind::NotFound && mask_asset_id.is_none() =>
        {
            GrayImage::from_pixel(image.width(), image.height(), Luma([255]))
        }
        Err(error) => return Err(format!("读取视觉流程模板遮罩失败：{error}")),
    };
    TemplateData::new(image, mask).map_err(|error| format!("视觉流程模板无效：{error}"))
}

pub fn template_exists(directory: &Path, asset_id: &str) -> Result<bool, String> {
    Ok(template_directory(directory, asset_id)?
        .join(TEMPLATE_FILE)
        .is_file())
}

pub fn delete_template(directory: &Path, asset_id: &str) -> Result<(), String> {
    let target = template_directory(directory, asset_id)?;
    match fs::remove_dir_all(target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除视觉流程模板失败：{error}")),
    }
}

pub fn validate_asset_id(asset_id: &str) -> Result<(), String> {
    if asset_id.is_empty() || asset_id.len() > MAX_ASSET_ID_LENGTH {
        return Err(format!(
            "模板资源 ID 长度必须为 1 到 {MAX_ASSET_ID_LENGTH} 个 ASCII 字符"
        ));
    }
    if !asset_id.is_ascii()
        || !asset_id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, b'-' | b'_' | b'.'))
        || !asset_id
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        || !asset_id
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
    {
        return Err(
            "模板资源 ID 只能包含 ASCII 字母、数字、点、短横线和下划线，且首尾必须为字母或数字"
                .into(),
        );
    }

    let stem = asset_id
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || (stem.len() == 4
            && matches!(&stem[..3], "COM" | "LPT")
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0');
    if reserved {
        return Err("模板资源 ID 不能使用 Windows 保留设备名称".into());
    }
    Ok(())
}

fn template_directory(directory: &Path, asset_id: &str) -> Result<PathBuf, String> {
    validate_asset_id(asset_id)?;
    Ok(directory.join("templates").join(asset_id))
}

fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, image::ImageError> {
    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, ImageFormat::Png)?;
    Ok(output.into_inner())
}

fn atomic_write(path: &Path, contents: &[u8], label: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("保存{label}失败：目标路径没有父目录"))?;
    fs::create_dir_all(parent).map_err(|error| format!("创建{label}目录失败：{error}"))?;
    let temporary_path = temporary_path(parent, path.file_name().unwrap_or(OsStr::new("data")));
    let result = (|| {
        let mut file = open_temporary_file(&temporary_path, label)?;
        file.write_all(contents)
            .map_err(|error| format!("写入{label}临时文件失败：{error}"))?;
        file.flush()
            .map_err(|error| format!("刷新{label}临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步{label}临时文件失败：{error}"))?;
        drop(file);
        replace_file(&temporary_path, path).map_err(|error| format!("替换{label}文件失败：{error}"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn open_temporary_file(path: &Path, label: &str) -> Result<File, String> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("创建{label}临时文件失败：{error}"))
}

fn temporary_path(parent: &Path, file_name: &OsStr) -> PathBuf {
    let sequence = TEMPORARY_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    parent.join(format!(
        ".{}.{}.{}.{}.tmp",
        file_name.to_string_lossy(),
        std::process::id(),
        timestamp,
        sequence
    ))
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除旧模板遮罩失败：{error}")),
    }
}

#[cfg(target_os = "windows")]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
    struct TestConfig {
        name: String,
        revision: u32,
    }

    fn temporary_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "macro-flow-visual-workflow-{label}-{}-{}",
            std::process::id(),
            TEMPORARY_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn asset_ids_reject_path_traversal_and_windows_devices() {
        for invalid in ["../secret", "nested/file", ".", "..", "CON", "lpt1.png"] {
            assert!(validate_asset_id(invalid).is_err(), "{invalid}");
        }
        for valid in ["purchase", "purchase-icon_2", "purchase.png"] {
            assert!(validate_asset_id(valid).is_ok(), "{valid}");
        }
    }

    #[test]
    fn config_round_trip_uses_the_fixed_config_path() {
        let directory = temporary_directory("config");
        let config = TestConfig {
            name: "抢购".into(),
            revision: 2,
        };
        save_config(&directory, &config).unwrap();
        assert_eq!(load_config(&directory).unwrap(), Some(config));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn template_without_mask_loads_with_an_opaque_mask() {
        let directory = temporary_directory("template");
        let image = DynamicImage::ImageLuma8(GrayImage::from_pixel(8, 6, Luma([80])));
        save_template(&directory, "purchase.png", &image, None).unwrap();
        let loaded = load_template(&directory, "purchase.png", None).unwrap();
        assert_eq!(loaded.image.dimensions(), (8, 6));
        assert!(loaded.mask.pixels().all(|pixel| pixel[0] == 255));
        delete_template(&directory, "purchase.png").unwrap();
        fs::remove_dir_all(directory).unwrap();
    }
}
