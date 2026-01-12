import { useState, useCallback, useRef } from 'react';

/**
 * Environmental Detection Hook
 *
 * Auto-detects environment type (quiet garage vs noisy warehouse)
 * and adjusts voice recognition settings accordingly.
 *
 * FREE IMPLEMENTATION - No API costs
 */

export type EnvironmentType = 'quiet' | 'moderate' | 'loud' | 'unknown';

export interface EnvironmentSettings {
  type: EnvironmentType;
  noiseLevel: number; // dB level
  vadThreshold: number; // Voice Activity Detection threshold (0-1)
  micGain: number; // Microphone gain multiplier (0.5-2.0)
  endpointing: number; // Deepgram endpointing (ms)
  detectedAt: number; // Timestamp
}

const DEFAULT_SETTINGS: EnvironmentSettings = {
  type: 'unknown',
  noiseLevel: 0,
  vadThreshold: 0.5,
  micGain: 1.0,
  endpointing: 100,
  detectedAt: 0
};

// Environment classification thresholds (dB)
const QUIET_THRESHOLD = 40;     // < 40dB = quiet room/garage
const MODERATE_THRESHOLD = 65;  // 40-65dB = office, small warehouse
// > 65dB = large warehouse, factory floor

export function useEnvironmentDetection() {
  const [environment, setEnvironment] = useState<EnvironmentSettings>(DEFAULT_SETTINGS);
  const [isDetecting, setIsDetecting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  /**
   * Calculate RMS (Root Mean Square) amplitude from audio buffer
   */
  const calculateRMS = useCallback((audioBuffer: AudioBuffer): number => {
    const channelData = audioBuffer.getChannelData(0); // Use first channel
    let sum = 0;

    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }

    const rms = Math.sqrt(sum / channelData.length);
    return rms;
  }, []);

  /**
   * Convert RMS to decibels
   */
  const rmsToDb = useCallback((rms: number): number => {
    if (rms === 0) return -Infinity;
    // Reference: 0 dB = RMS of 1.0 (full scale)
    return 20 * Math.log10(rms);
  }, []);

  /**
   * Classify environment based on noise level
   */
  const classifyEnvironment = useCallback((dbLevel: number): EnvironmentType => {
    if (dbLevel < QUIET_THRESHOLD) return 'quiet';
    if (dbLevel < MODERATE_THRESHOLD) return 'moderate';
    return 'loud';
  }, []);

  /**
   * Get optimal settings for detected environment
   */
  const getOptimalSettings = useCallback((envType: EnvironmentType, dbLevel: number): EnvironmentSettings => {
    const settings: EnvironmentSettings = {
      type: envType,
      noiseLevel: dbLevel,
      vadThreshold: 0.5,
      micGain: 1.0,
      endpointing: 100,
      detectedAt: Date.now()
    };

    switch (envType) {
      case 'quiet':
        // Sensitive detection - low noise floor
        settings.vadThreshold = 0.3;
        settings.micGain = 1.0;
        settings.endpointing = 100; // Can be aggressive
        console.log('[EnvDetect] 🏡 Quiet environment - Sensitive mode');
        break;

      case 'moderate':
        // Balanced - some background noise
        settings.vadThreshold = 0.5;
        settings.micGain = 1.2;
        settings.endpointing = 150; // Slightly more tolerant
        console.log('[EnvDetect] 🏢 Moderate environment - Balanced mode');
        break;

      case 'loud':
        // Aggressive noise gate - high noise floor
        settings.vadThreshold = 0.7;
        settings.micGain = 1.5;
        settings.endpointing = 200; // Very tolerant of pauses
        console.log('[EnvDetect] 🏭 Loud environment - Aggressive noise gate');
        break;

      default:
        console.log('[EnvDetect] ⚠️ Unknown environment - Using defaults');
    }

    return settings;
  }, []);

  /**
   * Capture ambient noise baseline
   * Records 3 seconds of "silence" (ambient noise) and analyzes it
   */
  const detectEnvironment = useCallback(async (stream: MediaStream): Promise<EnvironmentSettings> => {
    console.log('[EnvDetect] 📊 Starting environment detection...');
    setIsDetecting(true);

    try {
      // Create AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }
      const audioContext = audioContextRef.current;

      // Create media stream source
      const source = audioContext.createMediaStreamSource(stream);

      // Create script processor for analysis (deprecated but widely supported)
      // TODO: Migrate to AudioWorklet when browser support improves
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

      const samples: Float32Array[] = [];
      const CAPTURE_DURATION = 3000; // 3 seconds
      const startTime = Date.now();

      return new Promise((resolve, reject) => {
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          samples.push(new Float32Array(inputData));

          // Check if we've captured enough
          if (Date.now() - startTime >= CAPTURE_DURATION) {
            // Stop capturing
            source.disconnect();
            processor.disconnect();

            // Combine all samples into one buffer
            const totalLength = samples.reduce((sum, arr) => sum + arr.length, 0);
            const combinedSamples = new Float32Array(totalLength);
            let offset = 0;
            samples.forEach(arr => {
              combinedSamples.set(arr, offset);
              offset += arr.length;
            });

            // Create AudioBuffer
            const audioBuffer = audioContext.createBuffer(
              1,
              combinedSamples.length,
              audioContext.sampleRate
            );
            audioBuffer.copyToChannel(combinedSamples, 0);

            // Calculate noise level
            const rms = calculateRMS(audioBuffer);
            const dbLevel = rmsToDb(rms);

            // Normalize dB level (convert from negative scale to positive)
            // Typical range: -60dB (very quiet) to -20dB (very loud)
            // Map to 0-100 scale for easier interpretation
            const normalizedDb = Math.max(0, Math.min(100, dbLevel + 60));

            console.log('[EnvDetect] Raw RMS:', rms.toFixed(6));
            console.log('[EnvDetect] Raw dB:', dbLevel.toFixed(2));
            console.log('[EnvDetect] Normalized dB:', normalizedDb.toFixed(2));

            // Classify environment
            const envType = classifyEnvironment(normalizedDb);
            const settings = getOptimalSettings(envType, normalizedDb);

            setEnvironment(settings);
            setIsDetecting(false);

            console.log('[EnvDetect] ✅ Detection complete:', {
              type: envType,
              noiseLevel: normalizedDb.toFixed(2) + ' dB',
              vadThreshold: settings.vadThreshold,
              micGain: settings.micGain,
              endpointing: settings.endpointing
            });

            resolve(settings);
          }
        };

        // Connect nodes
        source.connect(processor);
        processor.connect(audioContext.destination);

        // Timeout fallback
        setTimeout(() => {
          if (isDetecting) {
            source.disconnect();
            processor.disconnect();
            reject(new Error('Environment detection timeout'));
          }
        }, CAPTURE_DURATION + 1000);
      });

    } catch (error) {
      console.error('[EnvDetect] ❌ Detection failed:', error);
      setIsDetecting(false);

      // Return moderate defaults on error
      const fallbackSettings = getOptimalSettings('moderate', 50);
      setEnvironment(fallbackSettings);
      return fallbackSettings;
    }
  }, [calculateRMS, rmsToDb, classifyEnvironment, getOptimalSettings, isDetecting]);

  /**
   * Manual override - user selects environment type
   */
  const setEnvironmentManual = useCallback((type: EnvironmentType) => {
    console.log('[EnvDetect] 👤 Manual override:', type);
    const settings = getOptimalSettings(type, type === 'quiet' ? 30 : type === 'moderate' ? 50 : 70);
    setEnvironment(settings);
  }, [getOptimalSettings]);

  /**
   * Reset to defaults
   */
  const resetEnvironment = useCallback(() => {
    console.log('[EnvDetect] 🔄 Reset to defaults');
    setEnvironment(DEFAULT_SETTINGS);
  }, []);

  /**
   * Get description for UI display
   */
  const getEnvironmentDescription = useCallback((type: EnvironmentType): string => {
    switch (type) {
      case 'quiet':
        return 'Quiet (Garage, Small Room)';
      case 'moderate':
        return 'Moderate (Office, Small Warehouse)';
      case 'loud':
        return 'Loud (Large Warehouse, Factory)';
      default:
        return 'Unknown (Not Detected)';
    }
  }, []);

  return {
    environment,
    isDetecting,
    detectEnvironment,
    setEnvironmentManual,
    resetEnvironment,
    getEnvironmentDescription
  };
}
