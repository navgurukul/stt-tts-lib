/**
 * Piper TTS Synthesizer using ONNX Runtime
 * Converts text to speech using Piper ONNX models
 */

// Type definitions for ONNX Runtime (optional dependency)
type InferenceSession = any;
type Tensor = any;

export interface PiperSynthesizerConfig {
  modelPath: string;
  configPath?: string;
  sampleRate?: number;
}

export interface SynthesisResult {
  audio: Float32Array;
  sampleRate: number;
  duration: number;
}

/**
 * Piper TTS Synthesizer
 * Loads ONNX model and synthesizes speech from phonemes
 */
export class PiperSynthesizer {
  private session: InferenceSession | null = null;
  private config: PiperSynthesizerConfig;
  private ready = false;

  constructor(config: PiperSynthesizerConfig) {
    this.config = {
      sampleRate: 22050,
      ...config,
    };
  }

  /**
   * Initialize the synthesizer by loading the ONNX model
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      // Get ONNX Runtime (try global first, then dynamic import)
      let ort: any;
      if (typeof window !== 'undefined' && (window as any).ort) {
        ort = (window as any).ort;
      } else {
        ort = await import('onnxruntime-web' as any);
      }
      
      // Load the ONNX model
      this.session = await ort.InferenceSession.create(this.config.modelPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      this.ready = true;
      console.log('✓ Piper synthesizer initialized');
    } catch (error) {
      throw new Error(`Failed to initialize Piper synthesizer: ${error}`);
    }
  }

  /**
   * Check if the synthesizer is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Synthesize speech from phoneme IDs
   * @param phonemeIds - Array of phoneme IDs (integers)
   * @returns Audio data as Float32Array
   */
  async synthesize(phonemeIds: number[]): Promise<SynthesisResult> {
    if (!this.ready || !this.session) {
      throw new Error('Synthesizer not initialized. Call initialize() first.');
    }

    try {
      // Get ONNX Runtime (try global first, then dynamic import)
      let ort: any;
      if (typeof window !== 'undefined' && (window as any).ort) {
        ort = (window as any).ort;
      } else {
        ort = await import('onnxruntime-web' as any);
      }

      // Dynamically import ONNX Runtime for Tensor creation

      // Prepare input tensor
      const inputTensor = new ort.Tensor('int64', BigInt64Array.from(phonemeIds.map(id => BigInt(id))), [1, phonemeIds.length]);

      // Run inference
      const outputs = await this.session.run({ input: inputTensor });

      // Extract audio from output tensor
      const audioTensor = outputs.output as Tensor;
      const audioData = audioTensor.data as Float32Array;

      return {
        audio: audioData,
        sampleRate: this.config.sampleRate!,
        duration: audioData.length / this.config.sampleRate!,
      };
    } catch (error) {
      throw new Error(`Synthesis failed: ${error}`);
    }
  }

  /**
   * Dispose of the synthesizer and free resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
      this.ready = false;
    }
  }
}

/**
 * Simple text-to-phoneme converter (placeholder)
 * In production, use a proper phonemizer like espeak-ng or piper's phonemizer
 */
export function textToPhonemes(text: string): number[] {
  // This is a VERY simplified placeholder
  // Real implementation needs espeak-ng or piper's phonemizer
  // For now, convert to character codes as a demo
  const phonemes: number[] = [];
  
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      phonemes.push(code - 32); // Map to 0-94 range
    }
  }
  
  return phonemes;
}

/**
 * Create and initialize a Piper synthesizer
 */
export async function createPiperSynthesizer(
  config: PiperSynthesizerConfig
): Promise<PiperSynthesizer> {
  const synthesizer = new PiperSynthesizer(config);
  await synthesizer.initialize();
  return synthesizer;
}
