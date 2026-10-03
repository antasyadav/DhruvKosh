export interface MouthValues {
  vowelA: number; // aa (Jaw drop / Mu khulna)
  vowelE: number; // e (Mid open)
  vowelI: number; // ih (Lips stretched / Teeth showing)
  vowelO: number; // oh (Lips round)
  vowelU: number; // ou (Lips pursed tight)
}

export class LipSyncSystem {
  public audioCtx: AudioContext;
  public analyser: AnalyserNode;
  private source: AudioBufferSourceNode | null = null;
  public isPlaying: boolean = false;
  public dataArray: Uint8Array;

  private smoothedValues: MouthValues = { vowelA: 0, vowelE: 0, vowelI: 0, vowelO: 0, vowelU: 0 };
  
  //  ASYMMETRIC SMOOTHING: Jaw opens fast, closes slower for realism
  private lerpOpen = 0.5;   // Khulne ki speed (Fast)
  private lerpClose = 0.15; // Band hone ki speed (Smooth decay)

  constructor() {
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024; //  Resolution double kar di (Better accuracy)
    this.analyser.smoothingTimeConstant = 0.2; // Native smoothing kam rakhi hai, hum custom use karenge
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  public stop() {
    if (this.source) {
      try { this.source.stop(); } catch (e) {}
    }
    this.isPlaying = false;
    this.smoothedValues = { vowelA: 0, vowelE: 0, vowelI: 0, vowelO: 0, vowelU: 0 };
  }

  async playAudioFromBase64(base64: string): Promise<void> {
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    this.stop();

    try {
      const binaryString = window.atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer as ArrayBuffer);
      this.source = this.audioCtx.createBufferSource();
      this.source.buffer = audioBuffer;
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
      this.source.start(0);
      this.isPlaying = true;
      this.source.onended = () => { 
        this.isPlaying = false; 
        if ((window as any).motionController) {
          (window as any).motionController.play('IDLE');
        }
      };
    } catch (error) {
      console.error(" Audio Decode Error:", error);
      this.isPlaying = false;
    }
  }

  getVowelValues(): MouthValues {
    if (!this.isPlaying) {
      // Audio stop hone par achanak snap na ho, smoothly band ho
      return this.applySmoothing({ vowelA: 0, vowelE: 0, vowelI: 0, vowelO: 0, vowelU: 0 });
    }

    // @ts-ignore
    this.analyser.getByteFrequencyData(this.dataArray);

    // 1. CALCULATE RMS VOLUME (True Energy of Voice)
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = this.dataArray[i] / 255;
      sumSquares += normalized * normalized;
    }
    const rmsVolume = Math.sqrt(sumSquares / this.dataArray.length);
    
    //  NOISE GATE: Background noise par muh na chale
    if (rmsVolume < 0.02) {
      return this.applySmoothing({ vowelA: 0, vowelE: 0, vowelI: 0, vowelO: 0, vowelU: 0 });
    }

    // 2. DYNAMIC FREQUENCY MAPPING (Hz to Bins)
    const hzPerBin = this.audioCtx.sampleRate / 2 / this.analyser.frequencyBinCount;
    const getBin = (hz: number) => Math.floor(hz / hzPerBin);

    // Human Voice Formants
    const bassFreq = this.getAverageInRange(getBin(80), getBin(250));     // Deep chest tones (O, U)
    const midFreq = this.getAverageInRange(getBin(250), getBin(2000));    // Throat tones (A, E)
    const highFreq = this.getAverageInRange(getBin(2000), getBin(5000));  // Sibilance 'S', 'T' (I)

    // Base volume multiplier (Kitna zor se bol rahi hai)
    const intensity = Math.min(1.0, rmsVolume * 3.5); 

    // 3. VOWEL LOGIC
    const rawValues = {
      // 'A' (Aaa) - Jaws drop heavily based on volume and mid frequency
      vowelA: intensity * (midFreq / 255) * 0.65,
      
      // 'E' (Eee) - Needs mid-high frequency
      vowelE: intensity * (highFreq / 255) * 0.45,
      
      // 'I' (Ihh) - Triggers on S/T/Sh sounds (Teeth clenching)
      vowelI: Math.min(0.6, (highFreq / 255) * 0.8),
      
      // 'O' (Ohh) - Round lips, combination of bass and volume
      vowelO: intensity * (bassFreq / 255) * 0.65,
      
      // 'U' (Ooo) - Pursed lips, triggers when bass dominates over mid
      vowelU: (bassFreq > midFreq) ? intensity * 0.5 : 0.05
    };

    // Prevent values from going above 1.0 or below 0.0
    Object.keys(rawValues).forEach((key) => {
      (rawValues as any)[key] = Math.min(1.0, Math.max(0.0, (rawValues as any)[key]));
    });

    return this.applySmoothing(rawValues);
  }

  private applySmoothing(target: MouthValues): MouthValues {
    //  Magic Trick: Khulna jaldi chahiye, band aaram se hona chahiye
    const smooth = (current: number, targetVal: number) => {
      const factor = targetVal > current ? this.lerpOpen : this.lerpClose;
      return current + (targetVal - current) * factor;
    };

    this.smoothedValues.vowelA = smooth(this.smoothedValues.vowelA, target.vowelA);
    this.smoothedValues.vowelE = smooth(this.smoothedValues.vowelE, target.vowelE);
    this.smoothedValues.vowelI = smooth(this.smoothedValues.vowelI, target.vowelI);
    this.smoothedValues.vowelO = smooth(this.smoothedValues.vowelO, target.vowelO);
    this.smoothedValues.vowelU = smooth(this.smoothedValues.vowelU, target.vowelU);

    return this.smoothedValues;
  }

  private getAverageInRange(startBin: number, endBin: number): number {
    const safeStart = Math.max(0, Math.min(startBin, this.dataArray.length - 1));
    const safeEnd = Math.max(0, Math.min(endBin, this.dataArray.length));
    if (safeEnd <= safeStart) return 0;

    let sum = 0;
    for (let i = safeStart; i < safeEnd; i++) {
      sum += this.dataArray[i];
    }
    return sum / (safeEnd - safeStart);
  }
}