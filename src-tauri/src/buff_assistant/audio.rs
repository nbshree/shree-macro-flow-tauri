use std::{
    collections::HashMap,
    fs::File,
    path::{Path, PathBuf},
    sync::mpsc::{self, RecvTimeoutError, Sender},
    thread,
    time::Duration,
};

use rodio::{Decoder, DeviceSinkBuilder, Player, Source, buffer::SamplesBuffer, source::SineWave};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

use super::model::BuffSoundCue;

const MAX_SOUND_DURATION: Duration = Duration::from_secs(10);
const PLAYBACK_POLL_INTERVAL: Duration = Duration::from_millis(20);
const AUDIO_IDLE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug)]
pub enum ResolvedSoundSource {
    Sine,
    Wav(PathBuf),
}

struct AudioRequest {
    cue: BuffSoundCue,
    source: ResolvedSoundSource,
    volume: f32,
}

#[derive(Clone)]
pub struct AudioEngine {
    sender: Sender<AudioRequest>,
}

impl AudioEngine {
    pub fn start(app: AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel::<AudioRequest>();
        thread::spawn(move || {
            let mut cache = HashMap::<PathBuf, SamplesBuffer>::new();
            while let Ok(mut request) = receiver.recv() {
                let mut stream = match DeviceSinkBuilder::open_default_sink() {
                    Ok(stream) => stream,
                    Err(error) => {
                        app.state::<AppState>()
                            .log(&app, format!("提示音播放失败：无法打开声音设备：{error}"));
                        continue;
                    }
                };
                stream.log_on_drop(false);

                'playback: loop {
                    let player = Player::connect_new(stream.mixer());
                    player.set_volume(request.volume.clamp(0.0, 1.0));
                    match request.source {
                        ResolvedSoundSource::Sine => player.append(sine_wave(request.cue)),
                        ResolvedSoundSource::Wav(path) => match cached_wav(&path, &mut cache) {
                            Ok(sound) => player.append(sound),
                            Err(_) => player.append(sine_wave(request.cue)),
                        },
                    }

                    loop {
                        match receiver.recv_timeout(PLAYBACK_POLL_INTERVAL) {
                            Ok(next_request) => {
                                player.stop();
                                request = next_request;
                                continue 'playback;
                            }
                            Err(RecvTimeoutError::Timeout) if player.empty() => break,
                            Err(RecvTimeoutError::Timeout) => {}
                            Err(RecvTimeoutError::Disconnected) => return,
                        }
                    }

                    // Keep the device alive briefly so countdown sounds can reuse one stream,
                    // then release it instead of holding headphones open for the app lifetime.
                    match receiver.recv_timeout(AUDIO_IDLE_TIMEOUT) {
                        Ok(next_request) => {
                            request = next_request;
                            continue 'playback;
                        }
                        Err(RecvTimeoutError::Timeout) => break 'playback,
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
            }
        });

        Self { sender }
    }

    pub fn play(&self, cue: BuffSoundCue, source: ResolvedSoundSource, volume: f32) {
        let _ = self.sender.send(AudioRequest {
            cue,
            source,
            volume,
        });
    }
}

pub fn validate_wav_file(path: &Path) -> Result<(), String> {
    decode_wav(path).map(|_| ())
}

fn cached_wav(
    path: &Path,
    cache: &mut HashMap<PathBuf, SamplesBuffer>,
) -> Result<SamplesBuffer, String> {
    if let Some(sound) = cache.get(path) {
        return Ok(sound.clone());
    }
    let sound = decode_wav(path)?;
    cache.insert(path.to_path_buf(), sound.clone());
    Ok(sound)
}

fn decode_wav(path: &Path) -> Result<SamplesBuffer, String> {
    let file = File::open(path).map_err(|error| format!("读取 WAV 文件失败：{error}"))?;
    let decoder = Decoder::try_from(file).map_err(|error| format!("WAV 解码失败：{error}"))?;
    let duration = decoder
        .total_duration()
        .ok_or_else(|| "无法确定 WAV 时长".to_string())?;
    if duration.is_zero() {
        return Err("WAV 文件没有可播放内容".into());
    }
    if duration > MAX_SOUND_DURATION {
        return Err("WAV 文件不能超过 10 秒".into());
    }
    let channels = decoder.channels();
    let sample_rate = decoder.sample_rate();
    Ok(SamplesBuffer::new(
        channels,
        sample_rate,
        decoder.collect::<Vec<_>>(),
    ))
}

fn sine_wave(cue: BuffSoundCue) -> impl Source + Send + 'static {
    let (frequency, duration) = match cue {
        BuffSoundCue::Triggered => (820.0, 180),
        BuffSoundCue::PrewarnThree | BuffSoundCue::PrewarnTwo | BuffSoundCue::PrewarnOne => {
            (800.0, 170)
        }
    };
    SineWave::new(frequency).take_duration(Duration::from_millis(duration))
}
