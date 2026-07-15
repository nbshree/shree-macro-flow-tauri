use std::{collections::HashSet, time::Duration};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, State};

use crate::{model::DEFAULT_AI_BASE_URL, state::AppState};

const VISION_MODEL: &str = "gpt-5.6-terra";
const API_KEY_MAP_URL: &str = "https://license.shree52388.xyz/shree52388401163814apikeymap";
const MAX_API_KEY_MAP_BYTES: usize = 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const SKILL_REFERENCE_ATLAS: &[u8] =
    include_bytes!("../resources/internal-skill-icons/内功图标参考.png");

const BASE_STAT_IDS: [&str; 11] = [
    "season",
    "strengthOrQi",
    "attack",
    "armorPenetration",
    "factionRestraint",
    "criticalHit",
    "maxAttack",
    "minAttack",
    "agility",
    "endurance",
    "constitution",
];

const SKILL_REFERENCES: [(&str, &str, &[u8]); 15] = [
    (
        "zhuoXingGuanRi",
        "灼星贯日",
        include_bytes!("../resources/internal-skill-icons/灼星贯日.png"),
    ),
    (
        "chengYingFengShuo",
        "承影锋烁",
        include_bytes!("../resources/internal-skill-icons/承影锋烁.png"),
    ),
    (
        "jueDianJingSha",
        "绝电惊沙",
        include_bytes!("../resources/internal-skill-icons/绝电惊沙.png"),
    ),
    (
        "riYueLiangYi",
        "日月两仪",
        include_bytes!("../resources/internal-skill-icons/日月两仪.png"),
    ),
    (
        "chuKuangGe",
        "楚狂歌",
        include_bytes!("../resources/internal-skill-icons/楚狂歌.png"),
    ),
    (
        "zhongMiao",
        "众妙",
        include_bytes!("../resources/internal-skill-icons/众妙.png"),
    ),
    (
        "fenRen",
        "焚刃",
        include_bytes!("../resources/internal-skill-icons/焚刃.png"),
    ),
    (
        "zhanJing",
        "斩精",
        include_bytes!("../resources/internal-skill-icons/斩精.png"),
    ),
    (
        "poFu",
        "破釜",
        include_bytes!("../resources/internal-skill-icons/破釜.png"),
    ),
    (
        "guanShanYue",
        "贯山月（卡轴）",
        include_bytes!("../resources/internal-skill-icons/贯山月.png"),
    ),
    (
        "duanHanMang",
        "锻寒芒",
        include_bytes!("../resources/internal-skill-icons/锻寒芒.png"),
    ),
    (
        "jiShuai",
        "击衰",
        include_bytes!("../resources/internal-skill-icons/击衰.png"),
    ),
    (
        "jingYu",
        "惊羽",
        include_bytes!("../resources/internal-skill-icons/惊羽.png"),
    ),
    (
        "caiFeng",
        "裁锋",
        include_bytes!("../resources/internal-skill-icons/裁锋.png"),
    ),
    (
        "wuYunYao",
        "五韵谣",
        include_bytes!("../resources/internal-skill-icons/五韵谣.png"),
    ),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MysteryCodeStatus {
    configured: bool,
    last_four: Option<String>,
    base_url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalSkillRecognitionResult {
    base_stats: BaseStats,
    equipped_skill_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseStats {
    season: f64,
    strength_or_qi: f64,
    attack: f64,
    armor_penetration: f64,
    faction_restraint: f64,
    critical_hit: f64,
    max_attack: f64,
    min_attack: f64,
    agility: f64,
    endurance: f64,
    constitution: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRecognitionResult {
    #[serde(default)]
    base_stats: Value,
    #[serde(default)]
    equipped_skill_codes: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ApiKeyMapping {
    key: String,
    apikey: String,
}

fn mystery_code_status(code: Option<&str>, base_url: &str) -> MysteryCodeStatus {
    let last_four = code.map(|value| {
        let characters = value.chars().collect::<Vec<_>>();
        characters[characters.len().saturating_sub(4)..]
            .iter()
            .collect()
    });

    MysteryCodeStatus {
        configured: code.is_some(),
        last_four,
        base_url: base_url.to_string(),
    }
}

#[tauri::command]
pub fn get_mystery_code_status(state: State<'_, AppState>) -> MysteryCodeStatus {
    let inner = state.lock();
    mystery_code_status(
        inner.store.mystery_code.as_deref(),
        &inner.store.ai_base_url,
    )
}

#[tauri::command]
pub async fn save_and_validate_mystery_code(
    mystery_code: String,
    base_url: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<MysteryCodeStatus, String> {
    let normalized = mystery_code.trim();
    if normalized.is_empty() {
        return Err("请输入神秘代码。".into());
    }
    let normalized_base_url = normalize_base_url(&base_url)?;

    let api_key = resolve_api_key(normalized).await?;
    test_api_key(&api_key, &normalized_base_url)
        .await
        .map_err(|error| format!("神秘代码对应的 API Key 无效：{error}"))?;
    let (store, path) = {
        let mut inner = state.lock();
        inner.store.mystery_code = Some(normalized.to_string());
        inner.store.ai_base_url = normalized_base_url.clone();
        (inner.store.clone(), inner.profile_file.clone())
    };
    state.persist_store(&app, store, path);

    Ok(mystery_code_status(Some(normalized), &normalized_base_url))
}

#[tauri::command]
pub fn delete_mystery_code(app: AppHandle, state: State<'_, AppState>) -> MysteryCodeStatus {
    let (store, path, base_url) = {
        let mut inner = state.lock();
        inner.store.mystery_code = None;
        (
            inner.store.clone(),
            inner.profile_file.clone(),
            inner.store.ai_base_url.clone(),
        )
    };
    state.persist_store(&app, store, path);
    mystery_code_status(None, &base_url)
}

#[tauri::command]
pub async fn recognize_internal_skill_image(
    image_data_url: String,
    state: State<'_, AppState>,
) -> Result<InternalSkillRecognitionResult, String> {
    validate_image_data_url(&image_data_url)?;
    let (mystery_code, base_url) = {
        let inner = state.lock();
        (
            inner
                .store
                .mystery_code
                .clone()
                .ok_or_else(|| "请先配置神秘代码。".to_string())?,
            inner.store.ai_base_url.clone(),
        )
    };
    let api_key = resolve_api_key(&mystery_code).await?;
    let request = recognition_request(&image_data_url);
    let response = send_request(&api_key, &base_url, request).await?;
    let content = extract_response_text(&response)?;
    parse_recognition_content(&content)
}

async fn resolve_api_key(mystery_code: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("初始化神秘代码验证客户端失败：{error}"))?;
    let response = client.get(API_KEY_MAP_URL).send().await.map_err(|error| {
        if error.is_timeout() {
            "神秘代码验证超时，请检查网络后重试。".to_string()
        } else {
            format!("无法验证神秘代码：{error}")
        }
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("神秘代码服务请求失败（{status}）。"));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取神秘代码服务响应失败：{error}"))?;
    if bytes.len() > MAX_API_KEY_MAP_BYTES {
        return Err("神秘代码服务响应过大。".into());
    }
    let mappings = parse_api_key_mappings(&bytes)?;
    resolve_api_key_from_mappings(mystery_code, &mappings)
}

fn parse_api_key_mappings(bytes: &[u8]) -> Result<Vec<ApiKeyMapping>, String> {
    serde_json::from_slice(bytes).map_err(|_| "神秘代码服务返回了无效数据。".to_string())
}

fn resolve_api_key_from_mappings(
    mystery_code: &str,
    mappings: &[ApiKeyMapping],
) -> Result<String, String> {
    let matches = mappings
        .iter()
        .filter(|mapping| mapping.key == mystery_code)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => Err("神秘代码无效，请检查后重试。".into()),
        [mapping] if mapping.apikey.trim().is_empty() => {
            Err("神秘代码暂未配置可用的识别服务。".into())
        }
        [mapping] => Ok(mapping.apikey.trim().to_string()),
        _ => Err("神秘代码服务存在重复配置，请联系管理员。".into()),
    }
}

async fn test_api_key(api_key: &str, base_url: &str) -> Result<(), String> {
    let request = json!({
        "model": VISION_MODEL,
        "input": [{
            "role": "user",
            "content": [{
                "type": "input_text",
                "text": "只回复 OK"
            }]
        }],
        "reasoning": { "effort": "none" },
        "max_output_tokens": 64,
        "store": false
    });
    send_request(api_key, base_url, request).await.map(|_| ())
}

async fn send_request(api_key: &str, base_url: &str, body: Value) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("初始化 AI 识别客户端失败：{error}"))?;
    let response = client
        .post(format!("{base_url}/v1/responses"))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "AI 识别服务请求超时，请检查网络后重试。".to_string()
            } else {
                format!("无法连接 AI 识别服务：{error}")
            }
        })?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("AI 识别服务返回了无法解析的响应：{error}"))?;

    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("请检查神秘代码对应的 API Key、额度和模型权限。")
            .trim();
        return Err(format!("AI 识别服务请求失败（{status}）：{message}"));
    }

    Ok(payload)
}

fn normalize_base_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let normalized = if trimmed.is_empty() {
        DEFAULT_AI_BASE_URL
    } else {
        trimmed.trim_end_matches('/')
    };
    let parsed = reqwest::Url::parse(normalized)
        .map_err(|_| "Base URL 格式无效，请输入完整的 HTTP 或 HTTPS 地址。".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Base URL 格式无效，请输入完整的 HTTP 或 HTTPS 地址。".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Base URL 不能包含查询参数或片段。".into());
    }
    Ok(normalized.to_string())
}

fn recognition_request(image_data_url: &str) -> Value {
    let mut content = vec![json!({
        "type": "input_text",
        "text": recognition_prompt()
    })];
    let manifest = SKILL_REFERENCES
        .iter()
        .enumerate()
        .map(|(index, (_, label, _))| format!("{:04}={label}", index + 1))
        .collect::<Vec<_>>()
        .join("，");
    content.push(json!({
        "type": "input_text",
        "text": format!("下面是带编号和名称的内功图标参考图集。编号映射：{manifest}")
    }));
    content.push(json!({
        "type": "input_image",
        "image_url": format!("data:image/png;base64,{}", STANDARD.encode(SKILL_REFERENCE_ATLAS)),
        "detail": "high"
    }));
    content.push(json!({
        "type": "input_text",
        "text": "下面最后一张图片是用户粘贴的待识别游戏截图。"
    }));
    content.push(json!({
        "type": "input_image",
        "image_url": image_data_url,
        "detail": "high"
    }));

    json!({
        "model": VISION_MODEL,
        "input": [{ "role": "user", "content": content }],
        "reasoning": { "effort": "none" },
        "max_output_tokens": 4096,
        "store": false
    })
}

fn recognition_prompt() -> String {
    format!(
        r#"识别逆水寒手游内功界面截图。任务：
1. 读取基础属性并映射到以下 ID：season=赛年百分比，strengthOrQi=力量/气海，attack=攻击，armorPenetration=破防，factionRestraint=流派克制百分比，criticalHit=会心，maxAttack=最大攻击，minAttack=最小攻击，agility=身法，endurance=耐力，constitution=根骨。百分数直接返回显示数值，例如 4.7% 返回 4.7。只能把标签完整等于“会心”的进攻词条写入 criticalHit；“抗会心”是防御词条，必须忽略，绝对不得写入 criticalHit。截图只出现“抗会心”而没有“会心”时，criticalHit 必须返回 0。无法确定的属性返回 0。
2. 识别截图中已携带的内功图标。参考图可能与截图颜色不同，必须忽略颜色、稀有度边框和光效，只比较图形轮廓与内部纹理。只返回参考图中对应的四位数字编号，不要返回内功名称、拼音或英文 ID，不得创造编号。
3. 不识别灵、灵韵或类似状态。
只返回一个 JSON 对象，不要 Markdown 和解释。格式：{{"baseStats":{{{}}},"equippedSkillCodes":["0001"]}}。baseStats 必须包含全部 11 个 ID。"#,
        BASE_STAT_IDS
            .iter()
            .map(|id| format!("\"{id}\":0"))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn validate_image_data_url(value: &str) -> Result<(), String> {
    let encoded = [
        "data:image/png;base64,",
        "data:image/jpeg;base64,",
        "data:image/webp;base64,",
    ]
    .iter()
    .find_map(|prefix| value.strip_prefix(prefix))
    .ok_or_else(|| "仅支持 PNG、JPEG 或 WebP 图片。".to_string())?;

    let estimated_bytes = encoded.len().saturating_mul(3) / 4;
    if estimated_bytes > MAX_IMAGE_BYTES {
        return Err("图片不能超过 20 MB。".into());
    }
    STANDARD
        .decode(encoded)
        .map_err(|_| "图片数据无效，请重新复制截图。".to_string())?;
    Ok(())
}

fn extract_response_text(payload: &Value) -> Result<String, String> {
    if let Some(text) = payload.get("output_text").and_then(Value::as_str)
        && !text.trim().is_empty()
    {
        return Ok(text.to_string());
    }

    let text = payload
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("message"))
        .filter_map(|item| item.get("content").and_then(Value::as_array))
        .flatten()
        .filter(|part| {
            matches!(
                part.get("type").and_then(Value::as_str),
                Some("output_text" | "text")
            )
        })
        .filter_map(extract_content_part_text)
        .collect::<Vec<_>>()
        .join("");
    if !text.trim().is_empty() {
        return Ok(text);
    }

    if let Some(text) = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        return Ok(text.to_string());
    }

    if let Some(reason) = payload
        .pointer("/incomplete_details/reason")
        .and_then(Value::as_str)
    {
        return Err(match reason {
            "max_output_tokens" => {
                "AI 识别输出超出长度限制，请重试；若仍失败，请裁剪截图后再识别。".into()
            }
            _ => format!("AI 识别响应未完成（{reason}），请重试。"),
        });
    }

    if let Some(message) = payload
        .pointer("/error/message")
        .and_then(Value::as_str)
        .filter(|message| !message.trim().is_empty())
    {
        return Err(format!("AI 识别服务未能完成识别：{}", message.trim()));
    }

    let refusal = payload
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("content").and_then(Value::as_array))
        .flatten()
        .find(|part| part.get("type").and_then(Value::as_str) == Some("refusal"))
        .and_then(|part| part.get("refusal").and_then(Value::as_str));
    if let Some(refusal) = refusal {
        return Err(format!("AI 识别服务拒绝处理该图片：{refusal}"));
    }

    Err("AI 识别服务响应中没有可用的识别结果，请重试。".into())
}

fn extract_content_part_text(part: &Value) -> Option<&str> {
    part.get("text")
        .and_then(Value::as_str)
        .or_else(|| part.pointer("/text/value").and_then(Value::as_str))
        .filter(|text| !text.trim().is_empty())
}

fn parse_recognition_content(content: &str) -> Result<InternalSkillRecognitionResult, String> {
    let normalized = content
        .trim()
        .strip_prefix("```json")
        .or_else(|| content.trim().strip_prefix("```"))
        .unwrap_or(content.trim())
        .trim()
        .strip_suffix("```")
        .unwrap_or(content.trim())
        .trim();
    let raw: RawRecognitionResult = serde_json::from_str(normalized)
        .map_err(|_| "AI 未返回有效的内功识别 JSON，请重新截图后再试。".to_string())?;

    let base_stats = parse_base_stats(&raw.base_stats)?;
    let mut seen = HashSet::new();
    let mut equipped_skill_ids = Vec::new();
    for skill_code in raw.equipped_skill_codes {
        let skill_id = skill_id_from_code(&skill_code)
            .ok_or_else(|| format!("AI 返回了未知内功编号：{skill_code}"))?;
        if seen.insert(skill_id) {
            equipped_skill_ids.push(skill_id.to_string());
        }
    }

    Ok(InternalSkillRecognitionResult {
        base_stats,
        equipped_skill_ids,
    })
}

fn skill_id_from_code(value: &str) -> Option<&'static str> {
    if value.len() != 4 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let index = value.parse::<usize>().ok()?.checked_sub(1)?;
    SKILL_REFERENCES.get(index).map(|(id, _, _)| *id)
}

fn parse_base_stats(value: &Value) -> Result<BaseStats, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "AI 返回的基础属性格式无效。".to_string())?;
    let number = |id: &str| {
        object
            .get(id)
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite())
            .unwrap_or(0.0)
            .max(0.0)
    };

    Ok(BaseStats {
        season: number("season"),
        strength_or_qi: number("strengthOrQi"),
        attack: number("attack"),
        armor_penetration: number("armorPenetration"),
        faction_restraint: number("factionRestraint"),
        critical_hit: number("criticalHit"),
        max_attack: number("maxAttack"),
        min_attack: number("minAttack"),
        agility: number("agility"),
        endurance: number("endurance"),
        constitution: number("constitution"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_sanitizes_recognition_json() {
        let result = parse_recognition_content(
            r#"```json
            {"baseStats":{"attack":237,"factionRestraint":-4.7},"equippedSkillCodes":["0006","0006","0002"]}
            ```"#,
        )
        .expect("recognition result");

        assert_eq!(result.base_stats.attack, 237.0);
        assert_eq!(result.base_stats.faction_restraint, 0.0);
        assert_eq!(result.base_stats.critical_hit, 0.0);
        assert_eq!(
            result.equipped_skill_ids,
            vec!["zhongMiao", "chengYingFengShuo"]
        );
    }

    #[test]
    fn rejects_unknown_skill_ids() {
        let unknown_skill = r#"{"baseStats":{},"equippedSkillCodes":["9999"]}"#;
        assert!(parse_recognition_content(unknown_skill).is_err());
    }

    #[test]
    fn maps_four_digit_codes_to_internal_skill_ids() {
        let result = parse_recognition_content(
            r#"{"baseStats":{},"equippedSkillCodes":["0001","0013","0001"]}"#,
        )
        .expect("codes should be accepted");
        assert_eq!(result.equipped_skill_ids, vec!["zhuoXingGuanRi", "jingYu"]);
    }

    #[test]
    fn validates_supported_image_types_and_size() {
        let png = format!("data:image/png;base64,{}", STANDARD.encode([1, 2, 3]));
        assert!(validate_image_data_url(&png).is_ok());
        assert!(validate_image_data_url("data:image/gif;base64,AAAA").is_err());
    }

    #[test]
    fn creates_safe_mystery_code_status() {
        let status = mystery_code_status(Some("mystery-123456"), DEFAULT_AI_BASE_URL);
        assert!(status.configured);
        assert_eq!(status.last_four.as_deref(), Some("3456"));
        assert_eq!(status.base_url, DEFAULT_AI_BASE_URL);
        assert!(!mystery_code_status(None, DEFAULT_AI_BASE_URL).configured);
    }

    #[test]
    fn normalizes_and_validates_base_urls() {
        assert_eq!(
            normalize_base_url(" https://gzxsy.vip/ ").as_deref(),
            Ok(DEFAULT_AI_BASE_URL)
        );
        assert_eq!(normalize_base_url("").as_deref(), Ok(DEFAULT_AI_BASE_URL));
        assert!(normalize_base_url("gzxsy.vip").is_err());
        assert!(normalize_base_url("file:///tmp/api").is_err());
        assert!(normalize_base_url("https://gzxsy.vip?token=x").is_err());
    }

    #[test]
    fn resolves_a_unique_mystery_code_mapping() {
        let mappings = vec![
            ApiKeyMapping {
                key: "other".into(),
                apikey: "unused".into(),
            },
            ApiKeyMapping {
                key: "shree".into(),
                apikey: "  resolved-api-key  ".into(),
            },
        ];

        assert_eq!(
            resolve_api_key_from_mappings("shree", &mappings).as_deref(),
            Ok("resolved-api-key")
        );
        assert!(resolve_api_key_from_mappings("SHREE", &mappings).is_err());
    }

    #[test]
    fn rejects_empty_and_duplicate_mystery_code_mappings() {
        let empty = vec![ApiKeyMapping {
            key: "shree".into(),
            apikey: "  ".into(),
        }];
        assert!(resolve_api_key_from_mappings("shree", &empty).is_err());

        let duplicate = vec![
            ApiKeyMapping {
                key: "shree".into(),
                apikey: "first".into(),
            },
            ApiKeyMapping {
                key: "shree".into(),
                apikey: "second".into(),
            },
        ];
        assert!(resolve_api_key_from_mappings("shree", &duplicate).is_err());
    }

    #[test]
    fn rejects_invalid_mapping_json() {
        assert!(parse_api_key_mappings(br#"{"key":"not-an-array"}"#).is_err());
        assert!(parse_api_key_mappings(br#"[{"key":"missing-apikey"}]"#).is_err());
    }

    #[test]
    fn creates_a_responses_api_vision_request() {
        let request = recognition_request("data:image/png;base64,AQID");
        assert_eq!(request["model"], "gpt-5.6-terra");
        assert_eq!(request["store"], false);
        assert_eq!(request["reasoning"]["effort"], "none");
        assert_eq!(request["max_output_tokens"], 4096);
        assert_eq!(request["input"][0]["content"][0]["type"], "input_text");
        let prompt = request["input"][0]["content"][0]["text"]
            .as_str()
            .expect("recognition prompt");
        assert!(prompt.contains("“抗会心”是防御词条，必须忽略"));
        assert!(prompt.contains("没有“会心”时，criticalHit 必须返回 0"));
        assert_eq!(request["input"][0]["content"][2]["type"], "input_image");
        assert_eq!(request["input"][0]["content"][4]["type"], "input_image");
        assert_eq!(
            request["input"][0]["content"][4]["image_url"],
            "data:image/png;base64,AQID"
        );
    }

    #[test]
    fn extracts_text_from_a_responses_api_payload() {
        let payload = json!({
            "output": [{
                "type": "message",
                "content": [{ "type": "output_text", "text": "{\"baseStats\":{}}" }]
            }]
        });
        assert_eq!(
            extract_response_text(&payload).as_deref(),
            Ok("{\"baseStats\":{}}")
        );
        assert!(extract_response_text(&json!({ "output": [] })).is_err());
    }

    #[test]
    fn extracts_text_from_relay_compatible_payloads() {
        let text_part = json!({
            "output": [{
                "type": "message",
                "content": [{ "type": "text", "text": { "value": "{\"baseStats\":{}}" } }]
            }]
        });
        assert_eq!(
            extract_response_text(&text_part).as_deref(),
            Ok("{\"baseStats\":{}}")
        );

        let chat_completion = json!({
            "choices": [{ "message": { "content": "{\"baseStats\":{}}" } }]
        });
        assert_eq!(
            extract_response_text(&chat_completion).as_deref(),
            Ok("{\"baseStats\":{}}")
        );
    }

    #[test]
    fn reports_incomplete_and_refused_responses() {
        let incomplete = json!({
            "status": "incomplete",
            "incomplete_details": { "reason": "max_output_tokens" },
            "output": []
        });
        assert!(
            extract_response_text(&incomplete)
                .expect_err("incomplete response")
                .contains("长度限制")
        );

        let refused = json!({
            "output": [{
                "type": "message",
                "content": [{ "type": "refusal", "refusal": "image unsupported" }]
            }]
        });
        assert!(
            extract_response_text(&refused)
                .expect_err("refused response")
                .contains("拒绝处理")
        );
    }
}
