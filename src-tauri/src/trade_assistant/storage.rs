use std::{
    fs,
    path::{Path, PathBuf},
};

use image::{DynamicImage, GrayImage};
use tauri::{AppHandle, Manager};

use crate::buff_assistant::detector::TemplateData;

use super::model::{TradeAssistantConfig, TradeTemplateKind, TradeTemplateSummary};

const CONFIG_FILE: &str = "config-v1.json";

pub fn storage_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("trade-assistant"))
        .map_err(|error| format!("无法确定交易行助手配置目录：{error}"))
}

pub fn load_config(directory: &Path) -> (TradeAssistantConfig, Vec<String>) {
    let mut notices = Vec::new();
    let path = directory.join(CONFIG_FILE);
    let mut config = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|error| error.to_string())
            .and_then(|contents| serde_json::from_str(&contents).map_err(|error| error.to_string()))
            .unwrap_or_else(|error| {
                notices.push(format!("交易行助手配置读取失败，已使用默认配置：{error}"));
                TradeAssistantConfig::default()
            })
    } else {
        TradeAssistantConfig::default()
    };
    config.sanitize();
    let purchase_missing = config.purchase_template.as_ref().is_some_and(|value| {
        !template_directory(directory, TradeTemplateKind::Purchase, &value.template.id).exists()
    });
    if purchase_missing {
        notices.push("购买图标模板文件不存在，请重新配置".into());
        config.purchase_template = None;
    }
    let guard_missing = config.guard_template.as_ref().is_some_and(|value| {
        !template_directory(directory, TradeTemplateKind::Guard, &value.template.id).exists()
    });
    if guard_missing {
        notices.push("商城状态图标模板文件不存在，请重新配置".into());
        config.guard_template = None;
    }
    (config, notices)
}

pub fn save_config(directory: &Path, config: &TradeAssistantConfig) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| format!("创建交易行助手目录失败：{error}"))?;
    let mut json = serde_json::to_string_pretty(config)
        .map_err(|error| format!("序列化交易行助手配置失败：{error}"))?;
    json.push('\n');
    fs::write(directory.join(CONFIG_FILE), json)
        .map_err(|error| format!("保存交易行助手配置失败：{error}"))
}

pub fn save_template(
    directory: &Path,
    kind: TradeTemplateKind,
    id: &str,
    image: &DynamicImage,
    mask: &GrayImage,
) -> Result<TradeTemplateSummary, String> {
    let target = template_directory(directory, kind, id);
    fs::create_dir_all(&target).map_err(|error| format!("创建模板目录失败：{error}"))?;
    image
        .save(target.join("template.png"))
        .map_err(|error| format!("保存模板图片失败：{error}"))?;
    mask.save(target.join("mask.png"))
        .map_err(|error| format!("保存模板遮罩失败：{error}"))?;
    Ok(TradeTemplateSummary {
        id: id.into(),
        width: image.width(),
        height: image.height(),
    })
}

pub fn load_template(
    directory: &Path,
    kind: TradeTemplateKind,
    summary: &TradeTemplateSummary,
) -> Result<TemplateData, String> {
    let target = template_directory(directory, kind, &summary.id);
    let image = image::open(target.join("template.png"))
        .map_err(|error| format!("读取模板图片失败：{error}"))?
        .into_luma8();
    let mask = image::open(target.join("mask.png"))
        .map_err(|error| format!("读取模板遮罩失败：{error}"))?
        .into_luma8();
    TemplateData::new(image, mask)
}

pub fn delete_template(
    directory: &Path,
    kind: TradeTemplateKind,
    summary: &TradeTemplateSummary,
) -> Result<(), String> {
    let target = template_directory(directory, kind, &summary.id);
    if target.exists() {
        fs::remove_dir_all(target).map_err(|error| format!("删除模板失败：{error}"))?;
    }
    Ok(())
}

fn template_directory(directory: &Path, kind: TradeTemplateKind, id: &str) -> PathBuf {
    let safe_id = id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect::<String>();
    directory
        .join("templates")
        .join(kind.directory())
        .join(safe_id)
}

impl TradeTemplateKind {
    fn directory(self) -> &'static str {
        match self {
            Self::Purchase => "purchase",
            Self::Guard => "guard",
        }
    }
}
