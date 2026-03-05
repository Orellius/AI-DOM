use serde::{Deserialize, Serialize};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscribeResult {
    pub text: String,
    pub language: String,
    pub duration: f32,
}

pub struct Transcriber {
    ctx: Mutex<WhisperContext>,
    language: String,
}

impl Transcriber {
    /// Load a whisper model from disk. This is a one-time operation (~2-3s).
    pub fn new(model_path: &str, language: &str) -> Result<Self, String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(model_path, params)
            .map_err(|e| format!("Failed to load whisper model: {}", e))?;

        Ok(Self {
            ctx: Mutex::new(ctx),
            language: language.to_string(),
        })
    }

    /// Transcribe PCM f32 audio data (16kHz mono).
    pub fn transcribe(&self, pcm_data: &[f32]) -> Result<TranscribeResult, String> {
        let ctx = self.ctx.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut state = ctx.create_state().map_err(|e| format!("Failed to create state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(4);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);

        // Language setting
        if self.language != "auto" {
            params.set_language(Some(&self.language));
        }

        state
            .full(params, pcm_data)
            .map_err(|e| format!("Transcription failed: {}", e))?;

        let num_segments = state.full_n_segments()
            .map_err(|e| format!("Failed to get segments: {}", e))?;

        let mut text = String::new();
        for i in 0..num_segments {
            if let Ok(segment_text) = state.full_get_segment_text(i) {
                text.push_str(&segment_text);
                text.push(' ');
            }
        }

        let duration = pcm_data.len() as f32 / 16000.0;
        let language = state
            .full_lang_id()
            .ok()
            .and_then(|id| {
                whisper_rs::get_lang_str(id).ok().map(|s| s.to_string())
            })
            .unwrap_or_else(|| self.language.clone());

        Ok(TranscribeResult {
            text: text.trim().to_string(),
            language,
            duration,
        })
    }
}
