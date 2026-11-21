/**
 * Sound Notification Service
 *
 * Provides synthesized acoustic chime presets using the browser's native Web Audio API:
 * 1. playInboundCallRing(): Dual-tone telephone ringing cadence (440Hz + 480Hz).
 * 2. playAsapRideChime(): High-priority ascending dispatch fanfare (587Hz -> 880Hz -> 1175Hz).
 * 3. playDriverOfferAlert() / stopDriverOfferAlert(): Urgent repeating chime cadence for incoming
 *    driver trip offers (respects mute state, auto-stops after timeout or on accept/decline).
 * 4. playSlaWarningChime(): Distinct double-pulse warning tone for upcoming SLA alerts.
 *
 * Zero external MP3/WAV dependencies; instant playback with local mute persistence and SSR safety.
 */

class SoundNotificationService {
  private static instance: SoundNotificationService;
  private audioCtx: AudioContext | null = null;
  private muted: boolean = false;
  private offerAlertInterval: ReturnType<typeof setInterval> | null = null;
  private offerAlertTimeout: ReturnType<typeof setTimeout> | null = null;
  private offerAlertActive: boolean = false;
  private readonly STORAGE_MUTE_KEY = 'cf_dispatch_sound_muted';

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(this.STORAGE_MUTE_KEY);
        this.muted = saved === 'true';
      } catch {
        this.muted = false;
      }
    }
  }

  public static getInstance(): SoundNotificationService {
    if (!SoundNotificationService.instance) {
      SoundNotificationService.instance = new SoundNotificationService();
    }
    return SoundNotificationService.instance;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch {
          return null;
        }
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public isSoundMuted(): boolean {
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setSoundMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopDriverOfferAlert();
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_MUTE_KEY, muted ? 'true' : 'false');
      } catch {}
    }
  }

  public toggleMute(): boolean {
    this.setSoundMuted(!this.muted);
    return this.muted;
  }

  public isDriverOfferAlertActive(): boolean {
    return this.offerAlertActive;
  }

  /**
   * Synthesize Inbound Phone Call Ring
   * Standard US telephone ring (440Hz + 480Hz dual tone cadence)
   */
  public playInboundCallRing(): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const playRingBurst = (startTime: number, duration: number) => {
      // 440 Hz tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, startTime);

      // 480 Hz tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, startTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, startTime);
      // Smooth attack
      masterGain.gain.linearRampToValueAtTime(0.18, startTime + 0.05);
      // Sustain
      masterGain.gain.setValueAtTime(0.18, startTime + duration - 0.05);
      // Smooth release
      masterGain.gain.linearRampToValueAtTime(0, startTime + duration);

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(masterGain);
      gain2.connect(masterGain);
      masterGain.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration);
      osc2.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Ring 1 (0.8s) -> short pause (0.4s) -> Ring 2 (0.8s)
    playRingBurst(now + 0.05, 0.8);
    playRingBurst(now + 1.25, 0.8);
  }

  /**
   * Synthesize ASAP / New Incoming Ride Chime
   * Ascending bright triple-chime fanfare (D5 -> A5 -> D6)
   */
  public playAsapRideChime(): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const notes = [
      { freq: 587.33, start: 0.0, dur: 0.18 }, // D5
      { freq: 880.0, start: 0.16, dur: 0.22 }, // A5
      { freq: 1174.66, start: 0.35, dur: 0.45 }, // D6
    ];

    const now = ctx.currentTime;
    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      // Attack and exponential decay envelope
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(0.25, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.05);
    });
  }

  /**
   * Single urgent 4-note driver offer chime burst (G5 -> B5 -> D6 -> G6).
   * High-clarity timbre designed to cut through road/cabin ambient noise.
   */
  private playSingleDriverOfferBurst(): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const sequence = [
      { freq: 783.99, start: 0.0, dur: 0.14 }, // G5
      { freq: 987.77, start: 0.13, dur: 0.14 }, // B5
      { freq: 1174.66, start: 0.26, dur: 0.16 }, // D6
      { freq: 1567.98, start: 0.41, dur: 0.36 }, // G6
    ];

    const now = ctx.currentTime;
    sequence.forEach((step) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(step.freq, now + step.start);

      gain.gain.setValueAtTime(0, now + step.start);
      gain.gain.linearRampToValueAtTime(0.28, now + step.start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, now + step.start + step.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + step.start);
      osc.stop(now + step.start + step.dur + 0.04);
    });
  }

  /**
   * Starts an urgent repeating chime cadence for incoming driver trip offers.
   * Respects mute state and auto-stops after `maxDurationMs` (default 30s) or when
   * `stopDriverOfferAlert()` is invoked on accept/decline.
   */
  public playDriverOfferAlert(maxDurationMs: number = 30_000): void {
    this.stopDriverOfferAlert();
    if (this.muted || typeof window === 'undefined') return;

    this.offerAlertActive = true;
    this.playSingleDriverOfferBurst();

    const safeMaxDuration = Math.max(1000, maxDurationMs);
    this.offerAlertInterval = setInterval(() => {
      if (this.muted) {
        this.stopDriverOfferAlert();
        return;
      }
      this.playSingleDriverOfferBurst();
    }, 2600);

    this.offerAlertTimeout = setTimeout(() => {
      this.stopDriverOfferAlert();
    }, safeMaxDuration);
  }

  /**
   * Immediately halts any active repeating driver offer alert cadence.
   */
  public stopDriverOfferAlert(): void {
    if (this.offerAlertInterval) {
      clearInterval(this.offerAlertInterval);
      this.offerAlertInterval = null;
    }
    if (this.offerAlertTimeout) {
      clearTimeout(this.offerAlertTimeout);
      this.offerAlertTimeout = null;
    }
    this.offerAlertActive = false;
  }

  /**
   * Synthesize SLA Warning Chime
   * Distinct double-pulse warning tone (E5 -> C5 repeated twice) for upcoming SLA thresholds.
   */
  public playSlaWarningChime(): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const pulses = [
      // Pulse 1
      { freq: 659.25, start: 0.0, dur: 0.14 }, // E5
      { freq: 523.25, start: 0.13, dur: 0.18 }, // C5
      // Pulse 2
      { freq: 659.25, start: 0.42, dur: 0.14 }, // E5
      { freq: 523.25, start: 0.55, dur: 0.22 }, // C5
    ];

    const now = ctx.currentTime;
    pulses.forEach((pulse) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(pulse.freq, now + pulse.start);

      gain.gain.setValueAtTime(0, now + pulse.start);
      gain.gain.linearRampToValueAtTime(0.24, now + pulse.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + pulse.start + pulse.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + pulse.start);
      osc.stop(now + pulse.start + pulse.dur + 0.04);
    });
  }
}

export const soundNotificationService = SoundNotificationService.getInstance();
