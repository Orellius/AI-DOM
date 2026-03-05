mod transcriber;
mod vad;

use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::time::Instant;

use transcriber::Transcriber;

/// JSON-RPC request from Electron main process
#[derive(Debug, Deserialize)]
struct Request {
    id: u64,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

/// JSON-RPC response to Electron main process
#[derive(Debug, Serialize)]
struct Response {
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

struct State {
    transcriber: Option<Transcriber>,
    start_time: Instant,
    transcription_count: u64,
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout_lock = stdout.lock();

    let mut state = State {
        transcriber: None,
        start_time: Instant::now(),
        transcription_count: 0,
    };

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let request: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let resp = Response {
                    id: 0,
                    result: None,
                    error: Some(format!("Invalid JSON: {}", e)),
                };
                let _ = writeln!(stdout_lock, "{}", serde_json::to_string(&resp).unwrap());
                let _ = stdout_lock.flush();
                continue;
            }
        };

        let response = handle_request(&mut state, &request);
        let _ = writeln!(stdout_lock, "{}", serde_json::to_string(&response).unwrap());
        let _ = stdout_lock.flush();

        // Shutdown means exit
        if request.method == "shutdown" {
            break;
        }
    }
}

fn handle_request(state: &mut State, req: &Request) -> Response {
    match req.method.as_str() {
        "init" => handle_init(state, req),
        "transcribe" => handle_transcribe(state, req),
        "vad_check" => handle_vad_check(req),
        "status" => handle_status(state, req),
        "shutdown" => Response {
            id: req.id,
            result: Some(serde_json::json!({"status": "shutting_down"})),
            error: None,
        },
        _ => Response {
            id: req.id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
        },
    }
}

fn handle_init(state: &mut State, req: &Request) -> Response {
    let model_path = req.params.get("model_path")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let language = req.params.get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("auto");

    if model_path.is_empty() {
        return Response {
            id: req.id,
            result: None,
            error: Some("model_path is required".to_string()),
        };
    }

    match Transcriber::new(model_path, language) {
        Ok(t) => {
            state.transcriber = Some(t);
            state.start_time = Instant::now();
            Response {
                id: req.id,
                result: Some(serde_json::json!({
                    "status": "ready",
                    "model_loaded": true,
                })),
                error: None,
            }
        }
        Err(e) => Response {
            id: req.id,
            result: None,
            error: Some(e),
        },
    }
}

fn handle_transcribe(state: &mut State, req: &Request) -> Response {
    let transcriber = match &state.transcriber {
        Some(t) => t,
        None => {
            return Response {
                id: req.id,
                result: None,
                error: Some("Model not initialized. Call 'init' first.".to_string()),
            };
        }
    };

    let audio_b64 = match req.params.get("audio_base64").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => {
            return Response {
                id: req.id,
                result: None,
                error: Some("audio_base64 is required".to_string()),
            };
        }
    };

    // Decode base64
    let audio_bytes = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, audio_b64) {
        Ok(b) => b,
        Err(e) => {
            return Response {
                id: req.id,
                result: None,
                error: Some(format!("Base64 decode error: {}", e)),
            };
        }
    };

    // Decode audio to PCM f32 16kHz mono
    let pcm = match decode_audio_to_pcm(&audio_bytes) {
        Ok(p) => p,
        Err(e) => {
            return Response {
                id: req.id,
                result: None,
                error: Some(format!("Audio decode error: {}", e)),
            };
        }
    };

    match transcriber.transcribe(&pcm) {
        Ok(result) => {
            state.transcription_count += 1;
            Response {
                id: req.id,
                result: Some(serde_json::json!({
                    "text": result.text,
                    "language": result.language,
                    "duration": result.duration,
                })),
                error: None,
            }
        }
        Err(e) => Response {
            id: req.id,
            result: None,
            error: Some(e),
        },
    }
}

fn handle_vad_check(req: &Request) -> Response {
    let audio_b64 = match req.params.get("audio_base64").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => {
            return Response {
                id: req.id,
                result: None,
                error: Some("audio_base64 is required".to_string()),
            };
        }
    };

    let threshold = req.params.get("threshold")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.02) as f32;

    let audio_bytes = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, audio_b64) {
        Ok(b) => b,
        Err(e) => {
            return Response {
                id: req.id,
                result: None,
                error: Some(format!("Base64 decode error: {}", e)),
            };
        }
    };

    let pcm = match decode_audio_to_pcm(&audio_bytes) {
        Ok(p) => p,
        Err(e) => {
            return Response {
                id: req.id,
                result: None,
                error: Some(format!("Audio decode error: {}", e)),
            };
        }
    };

    let (has_speech, energy) = vad::check_speech(&pcm, threshold);

    Response {
        id: req.id,
        result: Some(serde_json::json!({
            "has_speech": has_speech,
            "energy": energy,
        })),
        error: None,
    }
}

fn handle_status(state: &State, req: &Request) -> Response {
    let uptime = state.start_time.elapsed().as_secs();
    Response {
        id: req.id,
        result: Some(serde_json::json!({
            "status": if state.transcriber.is_some() { "ready" } else { "not_initialized" },
            "uptime_secs": uptime,
            "transcriptions_count": state.transcription_count,
        })),
        error: None,
    }
}

/// Decode raw audio bytes (WebM/Opus, WAV, etc.) to 16kHz mono f32 PCM.
/// Uses symphonia for format detection and decoding.
fn decode_audio_to_pcm(audio_bytes: &[u8]) -> Result<Vec<f32>, String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let cursor = std::io::Cursor::new(audio_bytes.to_vec());
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
    let hint = Hint::new();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe audio format: {}", e))?;

    let mut format = probed.format;

    let track = format.default_track()
        .ok_or("No audio track found")?;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;

    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let spec = *decoded.spec();
        let num_frames = decoded.frames();
        let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);

        let samples = sample_buf.samples();
        let channels = spec.channels.count();

        // Mix down to mono if needed
        if channels > 1 {
            for chunk in samples.chunks(channels) {
                let mono: f32 = chunk.iter().sum::<f32>() / channels as f32;
                all_samples.push(mono);
            }
        } else {
            all_samples.extend_from_slice(samples);
        }
    }

    // Resample to 16kHz if needed (simple linear interpolation)
    // Whisper expects 16kHz. Most WebM/Opus is 48kHz.
    // We assume 48kHz input for WebM; if different, whisper handles it gracefully.
    if all_samples.len() > 16000 {
        // Estimate source sample rate from typical WebM/Opus (48kHz)
        let source_rate = 48000.0_f64;
        let target_rate = 16000.0_f64;
        let ratio = source_rate / target_rate;
        let output_len = (all_samples.len() as f64 / ratio) as usize;
        let mut resampled = Vec::with_capacity(output_len);

        for i in 0..output_len {
            let src_idx = i as f64 * ratio;
            let idx = src_idx as usize;
            let frac = src_idx - idx as f64;
            let s0 = all_samples.get(idx).copied().unwrap_or(0.0);
            let s1 = all_samples.get(idx + 1).copied().unwrap_or(s0);
            resampled.push(s0 + (s1 - s0) * frac as f32);
        }

        return Ok(resampled);
    }

    Ok(all_samples)
}
