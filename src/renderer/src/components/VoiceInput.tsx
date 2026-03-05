import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Loader2 } from 'lucide-react'
import { scaled } from '../utils/scale'
import { useAgentStore } from '../stores/agentStore'

interface VoiceInputProps {
  onTranscript: (text: string) => void
}

const BAR_COUNT = 20
const VAD_THRESHOLD = 0.025
const SILENCE_THRESHOLD = 0.012
const SPEECH_CONFIRM_MS = 300
const SILENCE_CONFIRM_MS = 1500

export function VoiceInput({ onTranscript }: VoiceInputProps): JSX.Element {
  const voiceRecording = useAgentStore((s) => s.voiceRecording)
  const voiceProcessing = useAgentStore((s) => s.voiceProcessing)
  const voiceListening = useAgentStore((s) => s.voiceListening)
  const voiceAutoMode = useAgentStore((s) => s.voiceAutoMode)
  const voiceLastTranslation = useAgentStore((s) => s.voiceLastTranslation)
  const setVoiceRecording = useAgentStore((s) => s.setVoiceRecording)
  const setVoiceProcessing = useAgentStore((s) => s.setVoiceProcessing)
  const setVoiceListening = useAgentStore((s) => s.setVoiceListening)
  const setVoiceLastTranslation = useAgentStore((s) => s.setVoiceLastTranslation)
  const [error, setError] = useState<string | null>(null)
  const [bars, setBars] = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [translationBadge, setTranslationBadge] = useState<{ from: string; to: string } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // VAD refs for auto-listen mode
  const speechStartRef = useRef<number>(0)
  const silenceStartRef = useRef<number>(0)
  const isAutoRecordingRef = useRef(false)
  // Guard against double-stop in VAD loop (Issue 6)
  const isStoppingRef = useRef(false)

  // Cleanup on unmount — stop mic, audio context, animation frame
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  // Show translation badge briefly then fade
  useEffect(() => {
    if (voiceLastTranslation) {
      setTranslationBadge({ from: voiceLastTranslation.from.toUpperCase(), to: 'EN' })
      const timer = setTimeout(() => {
        setTranslationBadge(null)
        setVoiceLastTranslation(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [voiceLastTranslation, setVoiceLastTranslation])

  // Live waveform + VAD from AnalyserNode
  useEffect(() => {
    if ((!voiceRecording && !voiceListening) || !analyserRef.current) return

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const tick = (): void => {
      analyser.getByteFrequencyData(dataArray)
      const step = Math.floor(dataArray.length / BAR_COUNT)
      const next: number[] = []
      for (let i = 0; i < BAR_COUNT; i++) {
        next.push(dataArray[i * step] / 255)
      }
      setBars(next)

      // VAD for auto-listen mode
      if (voiceAutoMode && voiceListening && !voiceRecording && !voiceProcessing) {
        const rms = Math.sqrt(dataArray.reduce((sum, v) => sum + v * v, 0) / dataArray.length) / 255
        const now = Date.now()

        if (rms > VAD_THRESHOLD) {
          if (speechStartRef.current === 0) speechStartRef.current = now
          silenceStartRef.current = 0
          // Speech confirmed after threshold duration
          if (now - speechStartRef.current > SPEECH_CONFIRM_MS && !isAutoRecordingRef.current) {
            isAutoRecordingRef.current = true
            autoStartRecording()
          }
        } else {
          speechStartRef.current = 0
          // If auto-recording and silence detected, stop after threshold
          if (isAutoRecordingRef.current && voiceRecording && !isStoppingRef.current) {
            if (silenceStartRef.current === 0) silenceStartRef.current = now
            if (now - silenceStartRef.current > SILENCE_CONFIRM_MS) {
              isAutoRecordingRef.current = false
              silenceStartRef.current = 0
              stopRecording()
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animFrameRef.current)
  }, [voiceRecording, voiceListening, voiceAutoMode, voiceProcessing])

  // Use ref to always have latest onTranscript without recreating the callback
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  // Shared transcription handler — eliminates duplication (Issue 5)
  const handleTranscriptionBlob = useCallback(async (chunks: Blob[]) => {
    // Batch: recording=false + processing=true in one tick (Issue 4)
    setVoiceRecording(false)
    setVoiceProcessing(true)

    console.log('[VIBE:Voice] handleTranscriptionBlob called, chunks:', chunks.length)

    try {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      console.log('[VIBE:Voice] blob size:', blob.size, 'bytes')

      if (blob.size < 100) {
        console.warn('[VIBE:Voice] blob too small, skipping')
        return
      }

      const arrayBuffer = await blob.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer)
      console.log('[VIBE:Voice] calling transcribeAudio, base64 length:', base64.length)

      const result = await window.api.transcribeAudio(base64)
      console.log('[VIBE:Voice] transcription result:', JSON.stringify(result))

      if (result.text.trim()) {
        const textToInsert = result.translatedText?.trim() || result.text.trim()
        console.log('[VIBE:Voice] inserting text:', textToInsert)
        onTranscriptRef.current(textToInsert)

        if (result.translatedText && result.language !== 'en') {
          useAgentStore.getState().setVoiceLastTranslation({
            from: result.language,
            to: 'en',
            original: result.text.trim()
          })
        }
      } else {
        console.warn('[VIBE:Voice] transcription returned empty text')
        setError('No speech detected')
        setTimeout(() => setError(null), 4000)
      }
    } catch (err: any) {
      console.error('[VIBE:Voice] transcription error:', err)
      const msg = err.message || 'Transcription failed'
      setError(msg)
      setTimeout(() => setError(null), 8000)
    } finally {
      setVoiceProcessing(false)
    }
  }, [setVoiceRecording, setVoiceProcessing])

  // Start ambient listening (mic open, no recording)
  const startListening = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      source.connect(analyser)
      analyserRef.current = analyser

      setVoiceListening(true)
      speechStartRef.current = 0
      silenceStartRef.current = 0
      isAutoRecordingRef.current = false
      isStoppingRef.current = false
    } catch {
      setError('Microphone access denied')
      setTimeout(() => setError(null), 4000)
    }
  }, [setVoiceListening])

  // Stop ambient listening
  const stopListening = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    cancelAnimationFrame(animFrameRef.current)
    setBars(new Array(BAR_COUNT).fill(0))
    setVoiceListening(false)
    isAutoRecordingRef.current = false
    isStoppingRef.current = false
    speechStartRef.current = 0
    silenceStartRef.current = 0
  }, [setVoiceListening])

  // Auto-start recording from listening state (mic already open)
  const autoStartRecording = useCallback(() => {
    if (!streamRef.current) return

    const stream = streamRef.current
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
    })

    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []
    startTimeRef.current = Date.now()
    isStoppingRef.current = false

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      isStoppingRef.current = false
      const duration = (Date.now() - startTimeRef.current) / 1000
      console.log('[VIBE:Voice] auto-recording stopped, duration:', duration.toFixed(2), 's, chunks:', chunksRef.current.length)
      if (duration < 0.5) {
        console.warn('[VIBE:Voice] duration < 0.5s, discarding')
        setVoiceRecording(false)
        return
      }
      await handleTranscriptionBlob(chunksRef.current)
    }

    mediaRecorder.start(250)
    setVoiceRecording(true)
    timerRef.current = setTimeout(() => stopRecording(), 120000)
  }, [handleTranscriptionBlob, setVoiceRecording])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      source.connect(analyser)
      analyserRef.current = analyser

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []
      startTimeRef.current = Date.now()
      isStoppingRef.current = false

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        isStoppingRef.current = false
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        analyserRef.current = null
        cancelAnimationFrame(animFrameRef.current)
        setBars(new Array(BAR_COUNT).fill(0))

        const duration = (Date.now() - startTimeRef.current) / 1000
        console.log('[VIBE:Voice] manual recording stopped, duration:', duration.toFixed(2), 's, chunks:', chunksRef.current.length)
        if (duration < 0.5) {
          console.warn('[VIBE:Voice] duration < 0.5s, discarding')
          setVoiceRecording(false)
          return
        }

        await handleTranscriptionBlob(chunksRef.current)

        if (audioCtxRef.current) {
          await audioCtxRef.current.close()
          audioCtxRef.current = null
        }
      }

      mediaRecorder.start(250)
      setVoiceRecording(true)
      timerRef.current = setTimeout(() => stopRecording(), 120000)
    } catch {
      setError('Microphone access denied')
      setTimeout(() => setError(null), 4000)
    }
  }, [handleTranscriptionBlob, setVoiceRecording])

  const stopRecording = useCallback(() => {
    if (isStoppingRef.current) return // prevent double-stop from VAD loop
    isStoppingRef.current = true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      isStoppingRef.current = false
    }
  }, [])

  const handleClick = (): void => {
    if (voiceProcessing) return

    if (voiceAutoMode) {
      // Toggle ambient listening
      if (voiceListening) {
        if (voiceRecording) stopRecording()
        stopListening()
      } else {
        startListening()
      }
    } else {
      // Manual mode
      if (voiceRecording) {
        stopRecording()
      } else {
        startRecording()
      }
    }
  }

  // Determine pill visual state
  const pillState: 'idle' | 'listening' | 'recording' | 'processing' | 'error' =
    error ? 'error' :
    voiceProcessing ? 'processing' :
    voiceRecording ? 'recording' :
    voiceListening ? 'listening' :
    'idle'

  // Restyled: red idle, green when recording/speech detected
  const pillBorder =
    pillState === 'error' ? 'rgba(239, 68, 68, 0.3)' :
    pillState === 'recording' ? 'rgba(52, 211, 153, 0.25)' :
    pillState === 'listening' ? 'rgba(239, 68, 68, 0.15)' :
    pillState === 'idle' ? 'rgba(239, 68, 68, 0.1)' :
    'rgba(255, 255, 255, 0.06)'

  // Less dim idle state (0.75 instead of 0.5)
  const pillOpacity = pillState === 'idle' ? 0.75 : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: scaled(4) }}>
      {/* Always-visible pill */}
      <div style={{
        background: '#141414',
        border: `1px solid ${pillBorder}`,
        borderRadius: '8px',
        padding: `${scaled(4)} ${scaled(8)}`,
        display: 'flex',
        alignItems: 'center',
        gap: scaled(5),
        animation: pillState !== 'idle' ? 'slideUp 0.12s ease-out' : 'none',
        whiteSpace: 'nowrap',
        opacity: pillOpacity,
        transition: 'opacity 0.2s ease, border-color 0.2s ease',
        minHeight: scaled(24),
      }}>
        {/* Idle state — red toned */}
        {pillState === 'idle' && (
          <>
            <Mic size={10} style={{ color: '#ef4444' }} />
            <span style={{
              fontSize: scaled(9),
              fontFamily: 'var(--font-mono)',
              color: 'rgba(239, 68, 68, 0.7)',
              letterSpacing: '0.03em',
            }}>
              Ready
            </span>
          </>
        )}

        {/* Listening state (ambient mic open, waiting for speech) — red bars */}
        {pillState === 'listening' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5px', height: scaled(16) }}>
              {bars.map((v, i) => (
                <div
                  key={i}
                  style={{
                    width: '2px',
                    borderRadius: '1px',
                    background: `rgba(239, 68, 68, ${0.2 + v * 0.5})`,
                    height: `${Math.max(2, v * 12)}px`,
                    transition: 'height 0.06s ease-out',
                  }}
                />
              ))}
            </div>
            <span style={{
              fontSize: scaled(9),
              fontFamily: 'var(--font-mono)',
              color: 'rgba(239, 68, 68, 0.8)',
              letterSpacing: '0.03em',
            }}>
              Listening
            </span>
          </>
        )}

        {/* Recording state — green bars (speech detected) */}
        {pillState === 'recording' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5px', height: scaled(16) }}>
              {bars.map((v, i) => (
                <div
                  key={i}
                  style={{
                    width: '2px',
                    borderRadius: '1px',
                    background: `rgba(52, 211, 153, ${0.4 + v * 0.6})`,
                    height: `${Math.max(2, v * 16)}px`,
                    transition: 'height 0.06s ease-out',
                  }}
                />
              ))}
            </div>
            <span style={{
              fontSize: scaled(9),
              fontFamily: 'var(--font-mono)',
              color: '#34d399',
              letterSpacing: '0.03em',
            }}>
              Recording
            </span>
          </>
        )}

        {/* Processing state */}
        {pillState === 'processing' && (
          <>
            <Loader2
              size={12}
              style={{ color: 'var(--color-accent)', animation: 'voice-spin 1s linear infinite' }}
            />
            <span style={{
              fontSize: scaled(9),
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-muted)',
              letterSpacing: '0.03em',
            }}>
              Transcribing
            </span>
          </>
        )}

        {/* Error state */}
        {pillState === 'error' && (
          <span style={{
            fontSize: scaled(9),
            fontFamily: 'var(--font-mono)',
            color: '#ef4444',
            letterSpacing: '0.03em',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={error || undefined}
          >
            {error}
          </span>
        )}

        {/* Translation badge */}
        {translationBadge && pillState !== 'error' && (
          <span
            style={{
              fontSize: scaled(8),
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-accent)',
              background: 'rgba(139, 92, 246, 0.1)',
              padding: '1px 4px',
              borderRadius: '3px',
              letterSpacing: '0.05em',
              animation: 'slideUp 0.12s ease-out',
              cursor: 'default',
            }}
            title={voiceLastTranslation?.original || undefined}
          >
            {translationBadge.from} → {translationBadge.to}
          </span>
        )}
      </div>

      {/* Mic chip button — red idle, green when recording */}
      <button
        ref={buttonRef}
        onClick={handleClick}
        disabled={voiceProcessing}
        title={
          voiceAutoMode
            ? (voiceListening ? 'Stop listening' : 'Start listening')
            : (voiceRecording ? 'Stop recording' : voiceProcessing ? 'Transcribing...' : 'Voice input')
        }
        className={
          error ? 'chip chip-danger'
          : voiceRecording ? 'chip chip-active'
          : voiceListening ? 'chip chip-danger'
          : voiceProcessing ? 'chip chip-active'
          : 'chip'
        }
        style={{
          cursor: voiceProcessing ? 'wait' : 'pointer',
          padding: `${scaled(5)} ${scaled(8)}`,
          animation: voiceRecording ? 'voice-pulse 1.5s ease-in-out infinite' : 'none',
          ...(pillState === 'idle' ? { borderColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' } : {}),
          ...(pillState === 'recording' ? { borderColor: 'rgba(52, 211, 153, 0.2)', color: '#34d399' } : {}),
        }}
      >
        {voiceProcessing ? (
          <Loader2 size={16} style={{ animation: 'voice-spin 1s linear infinite' }} />
        ) : (
          <Mic size={16} />
        )}
      </button>
    </div>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
