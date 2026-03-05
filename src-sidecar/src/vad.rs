/// Voice Activity Detection using RMS energy threshold.
/// No neural VAD needed — simple energy-based detection is sufficient
/// for distinguishing speech from silence in a controlled mic input.

/// Check if the given PCM audio chunk contains speech.
/// Returns true if the RMS energy exceeds the threshold.
pub fn check_speech(pcm: &[f32], threshold: f32) -> (bool, f32) {
    if pcm.is_empty() {
        return (false, 0.0);
    }

    let sum_sq: f64 = pcm.iter().map(|&s| (s as f64) * (s as f64)).sum();
    let rms = (sum_sq / pcm.len() as f64).sqrt() as f32;

    (rms > threshold, rms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_below_threshold() {
        let silence = vec![0.0f32; 1600];
        let (has_speech, energy) = check_speech(&silence, 0.02);
        assert!(!has_speech);
        assert!(energy < 0.001);
    }

    #[test]
    fn loud_signal_above_threshold() {
        let loud: Vec<f32> = (0..1600).map(|i| (i as f32 / 100.0).sin() * 0.5).collect();
        let (has_speech, _energy) = check_speech(&loud, 0.02);
        assert!(has_speech);
    }

    #[test]
    fn empty_returns_no_speech() {
        let (has_speech, energy) = check_speech(&[], 0.02);
        assert!(!has_speech);
        assert_eq!(energy, 0.0);
    }
}
