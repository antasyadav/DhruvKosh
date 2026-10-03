import * as THREE from 'three';
import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mixamoFbx2motion } from '../animation/mixamoFbx2motion';

// ──────────────────────────────────────────────────────────────────────────
// FULL ANIMATION LIBRARY  (56 files including all maveai animations)
// ──────────────────────────────────────────────────────────────────────────
const ANIMATION_FILES: Record<string, string> = {
  // ── IDLE / REST ────────────────────────────────────────────────────────
  'IDLE':             '/animations/femineidle.fbx',
  'FEMINEIDLE':       '/animations/femineidle.fbx',
  'BREATHINGIDLE':    '/animations/breathingidle.fbx',
  'BREATHING':        '/animations/breathingidle.fbx',
  'REST':             '/animations/femineidle.fbx',
  'LAYING':           '/animations/laying.fbx',
  'WEIGHTSHIFT':      '/animations/weightshift.fbx',

  // ── TALKING / EXPLAINING ───────────────────────────────────────────────
  'SPEAKING':         '/animations/talking.fbx',
  'TALKING':          '/animations/talking.fbx',
  'SPEAK':            '/animations/talking.fbx',
  'EXPLAIN':          '/animations/talking.fbx',
  'POINTING':         '/animations/angrypoint.fbx',
  'POINT':            '/animations/angrypoint.fbx',
  'DISMISSING':       '/animations/dismissinggesture.fbx',
  'HANDGESTURE':      '/animations/happyhandgesture.fbx',
  'GESTURING':        '/animations/happyhandgesture.fbx',

  // ── GREETING / POSITIVE ───────────────────────────────────────────────
  'WAVE':             '/animations/waving.fbx',
  'WAVING':           '/animations/waving.fbx',
  'GREETING':         '/animations/waving.fbx',
  'HELLO':            '/animations/waving.fbx',
  'ACKNOWLEDGING':    '/animations/acknowledging.fbx',
  'NOD':              '/animations/headnodyes.fbx',
  'HEADNOD':          '/animations/headnodyes.fbx',
  'HARDNOD':          '/animations/hardheadnod.fbx',
  'LENGTHYDNOD':      '/animations/lengthyheadnod.fbx',

  // ── HAPPY / CELEBRATION ───────────────────────────────────────────────
  'VICTORY':          '/animations/femalevictory.fbx',
  'SUCCESS':          '/animations/femalevictory.fbx',
  'CHEER':            '/animations/cheering.fbx',
  'CHEERING':         '/animations/cheering.fbx',
  'CLAPPING':         '/animations/clapping.fbx',
  'CLAP':             '/animations/clapping.fbx',
  'HAPPY':            '/animations/happy.fbx',
  'JOY':              '/animations/joy.fbx',
  'EXCITED':          '/animations/excited.fbx',
  'LAUGHING':         '/animations/laughing.fbx',
  'LAUGH':            '/animations/laughing.fbx',

  // ── QUIZ CORRECT / WRONG (used by kids quiz) ──────────────────────────
  'QUIZ_CORRECT':     '/animations/femalevictory.fbx',
  'CORRECT':          '/animations/femalevictory.fbx',
  'QUIZ_WRONG':       '/animations/shakingheadno.fbx',
  'WRONG':            '/animations/shakingheadno.fbx',
  'TRYAGAIN':         '/animations/thoughtfulheadshake.fbx',

  // ── THINKING / FOCUS ──────────────────────────────────────────────────
  'THINKING':         '/animations/femalethinking.fbx',
  'THINK':            '/animations/femalethinking.fbx',
  'FOCUS':            '/animations/focus.fbx',
  'TYPING':           '/animations/typing.fbx',

  // ── SAD / NEGATIVE ────────────────────────────────────────────────────
  'SAD':              '/animations/sadanimation.fbx',
  'SORRY':            '/animations/sadanimation.fbx',
  'DEFEAT':           '/animations/saddefeat.fbx',
  'ERROR':            '/animations/saddefeat.fbx',
  'SADIDLE':          '/animations/sadidle.fbx',

  // ── DISMISSIVE / ANNOYED ──────────────────────────────────────────────
  'ANGRY':            '/animations/femaleangry.fbx',
  'ANNOYED':          '/animations/annoyedheadshake.fbx',
  'SHAKING':          '/animations/shakingheadno.fbx',
  'SHAKENO':          '/animations/shakingheadno.fbx',
  'SARCASTIC':        '/animations/sarcasticheadnod.fbx',

  // ── MISC / EXPRESSIVE ─────────────────────────────────────────────────
  'THANKFUL':         '/animations/thankfulwomen.fbx',
  'THANKS':           '/animations/thankfulwomen.fbx',
  'SURPRISED':        '/animations/surprised.fbx',
  'WOW':              '/animations/surprised.fbx',
  'YAWN':             '/animations/yawn.fbx',
  'RELIEVE':          '/animations/relievedsigh.fbx',
  'SIGH':             '/animations/relievedsigh.fbx',
  'LOOKAROUND':       '/animations/lookaround.fbx',
  'LOOK':             '/animations/lookaround.fbx',
  'LOOKAWAY':         '/animations/lookawaygesture.fbx',
  'LOOKINGSIDEWAYS':  '/animations/lookingsideways.fbx',
  'NERVOUS':          '/animations/nervouslylookaround.fbx',
  'BASHFUL':          '/animations/Bashful.fbx',
  'SHY':              '/animations/Bashful.fbx',
  'COVERMOUTH':       '/animations/coveringmouth.fbx',
  'BEINGCOCKY':       '/animations/beingcocky.fbx',
  'STEPBACK':         '/animations/steppingback.fbx',
  'STEPFORWARD':      '/animations/steppingforward.fbx',

  // ── MOVEMENT ──────────────────────────────────────────────────────────
  'WALKING':          '/animations/walking.fbx',
  'WALK':             '/animations/walking.fbx',

  // ── DANCE ─────────────────────────────────────────────────────────────
  'DANCE':            '/animations/standingdance.fbx',
  'STANDINGDANCE':    '/animations/standingdance.fbx',
};

// Animations that should loop continuously (vs. play-once)
const LOOPING_ANIMATIONS = new Set([
  'IDLE','FEMINEIDLE','BREATHINGIDLE','BREATHING','REST',
  'SPEAKING','TALKING','SPEAK','EXPLAIN',
  'THINKING','THINK','FOCUS','TYPING',
  'WALKING','WALK','LAYING','WEIGHTSHIFT',
  'LOOKAROUND','LOOK','NERVOUS',
]);

export class HumanAnimationController {
  public vrm: VRM;
  public mixer: THREE.AnimationMixer;
  private currentAction: THREE.AnimationAction | null = null;
  private currentMascotAction: string = 'IDLE';
  private clipCache: Map<string, THREE.AnimationClip> = new Map();
  private loader = new FBXLoader();

  // Natural Blinking & Mouth Flap state
  private blinkTimer = 0;
  private nextBlinkInterval = 3.5;
  private isBlinking = false;
  private isSpeaking = false;
  private speechTimer = 0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.play('IDLE', true); 
  }

  public update(deltaTime: number) {
    this.mixer.update(deltaTime);
    this.updateBlinking(deltaTime);
    this.updateMouthLipSync(deltaTime);
  }

  public setSpeaking(speaking: boolean) {
    this.isSpeaking = speaking;
    if (speaking) {
      this.play('SPEAKING');
    } else {
      this.play('IDLE');
      this.resetMouth();
    }
  }

  private updateBlinking(delta: number) {
    if (!this.vrm?.expressionManager) return;
    this.blinkTimer += delta;

    if (this.isBlinking) {
      // 0.15s blink duration. Sine wave goes from 0 to 1 to 0.
      const progress = this.blinkTimer / 0.15; 
      if (progress >= 1.0) {
        this.setBlendshapes(['blink', 'blinkLeft', 'blinkRight'], 0);
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.nextBlinkInterval = 2.5 + Math.random() * 3.5;
      } else {
        const value = Math.sin(progress * Math.PI) * 0.85; // max 0.85 to prevent aggressive squinting
        this.setBlendshapes(['blink', 'blinkLeft', 'blinkRight'], value);
      }
    } else {
      if (this.blinkTimer > this.nextBlinkInterval) {
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
    }
  }

  private updateMouthLipSync(delta: number) {
    if (!this.vrm?.expressionManager) return;

    // Check if browser speech synthesis is speaking
    const synthSpeaking = typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking;
    const active = this.isSpeaking || synthSpeaking;

    if (active) {
      this.speechTimer += delta * 15;
      const vowelA = Math.max(0, Math.sin(this.speechTimer) * 0.7 + Math.sin(this.speechTimer * 1.7) * 0.3);
      const vowelO = Math.max(0, Math.cos(this.speechTimer * 0.9) * 0.45);
      const vowelI = Math.max(0, Math.sin(this.speechTimer * 2.2) * 0.35);

      this.setBlendshapes(['aa', 'a'], vowelA);
      this.setBlendshapes(['oh', 'o'], vowelO);
      this.setBlendshapes(['ih', 'i', 'ee'], vowelI);
    }
  }

  private resetMouth() {
    this.setBlendshapes(['aa', 'a', 'oh', 'o', 'ih', 'i', 'ee', 'ou', 'u'], 0);
  }

  private setBlendshapes(names: string[], value: number) {
    if (!this.vrm?.expressionManager) return;
    for (const name of names) {
      try {
        this.vrm.expressionManager.setValue(name, value);
      } catch (_) {}
    }
  }

  public applyEmotion(emotion: string) {
    if (!this.vrm || !this.vrm.expressionManager) return;

    // Reset base facial emotion blendshapes (support VRM 0.0 & 1.0 presets)
    const emotionPresets = [
      'happy', 'joy', 'fun',
      'angry', 'sorrow', 'sad',
      'relaxed', 'surprised', 'neutral'
    ];
    this.setBlendshapes(emotionPresets, 0);

    const emo = String(emotion || 'NEUTRAL').toUpperCase();
    console.log("🎭 Polar Guide Facial Emotion:", emo);

    if (['HAPPY', 'FRIENDLY', 'CELEBRATORY', 'EXCITED', 'VICTORY', 'GOOD', 'SUCCESS'].includes(emo)) {
      this.setBlendshapes(['happy', 'joy', 'fun'], 1.0);
    }
    else if (['SAD', 'DISAPPOINTED', 'SORRY', 'DEFEAT'].includes(emo)) {
      this.setBlendshapes(['sad', 'sorrow'], 1.0);
    }
    else if (['ANGRY', 'FRUSTRATED', 'HATE'].includes(emo)) {
      this.setBlendshapes(['angry'], 1.0);
    }
    else if (['SURPRISED', 'SHOCKED', 'WOW'].includes(emo)) {
      this.setBlendshapes(['surprised'], 1.0);
    }
    else if (['CALM', 'RELAXED', 'PEACE'].includes(emo)) {
      this.setBlendshapes(['relaxed', 'fun'], 0.7);
    }
    else if (['THINKING', 'CONFUSED', 'SERIOUS', 'FOCUS'].includes(emo)) {
      this.setBlendshapes(['sad', 'sorrow'], 0.25);
      this.setBlendshapes(['neutral'], 0.75);
    }
    else if (['SUPPORTIVE', 'HELPFUL', 'THANKFUL'].includes(emo)) {
      this.setBlendshapes(['happy', 'joy'], 0.7);
      this.setBlendshapes(['relaxed'], 0.3);
    }
    else {
      this.setBlendshapes(['neutral'], 1.0);
    }
  }

  public applyFacialEmotion(emotion: string) {
    this.applyEmotion(emotion);
  }

  public applyAnimePersonaFace(emotion: string, _weight?: number) {
    this.applyEmotion(emotion);
  }

  public handleServerResponse(data: any) {
    if (data.mascotAction || data.action || data.animation) {
      this.play(data.mascotAction || data.action || data.animation);
    }
    if (data.emotion) {
      this.applyEmotion(data.emotion);
    }
  }

  public async play(actionName: string, force: boolean = false) {
    const actionKey = String(actionName || 'IDLE').toUpperCase();

    if (this.currentMascotAction === actionKey && !force) return;
    
    const path = ANIMATION_FILES[actionKey] || ANIMATION_FILES['IDLE'];
    if (!path) {
      console.warn(`⚠️ Animation [${actionKey}] not found. Fallback to IDLE.`);
      if (actionKey !== 'IDLE') this.play('IDLE');
      return;
    }

    try {
      const clip = await this.loadClip(path);
      const newAction = this.mixer.clipAction(clip);
      
      if (this.currentAction) this.currentAction.fadeOut(0.35);

      newAction.reset().fadeIn(0.35).play();
      this.currentAction = newAction;
      this.currentMascotAction = actionKey;

      const isLoop = ['IDLE', 'THINKING', 'SPEAKING', 'TALKING', 'BREATHING', 'BREATHINGIDLE', 'FEMINEIDLE', 'WALKING', 'WALK'].includes(actionKey);
      
      newAction.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, isLoop ? Infinity : 1);
      newAction.clampWhenFinished = !isLoop;

      if (!isLoop) {
        const onFinished = (e: any) => {
          if (e.action === newAction) {
            this.mixer.removeEventListener('finished', onFinished);
            this.play('IDLE'); 
          }
        };
        this.mixer.addEventListener('finished', onFinished);
      }
    } catch (err) {
      console.error("Rig Sync Error:", err);
    }
  }

  public async playAnimation(actionKey: string) {
    return this.play(actionKey);
  }

  private async loadClip(path: string): Promise<THREE.AnimationClip> {
    if (this.clipCache.has(path)) return this.clipCache.get(path)!;
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (fbx) => {
          try {
            const motion = mixamoFbx2motion(fbx, this.vrm);
            this.clipCache.set(path, motion.clip);
            resolve(motion.clip);
          } catch (e) {
            reject(e);
          }
        },
        undefined,
        (err) => {
          console.error(`Failed to load FBX animation at ${path}:`, err);
          reject(err);
        }
      );
    });
  }

  public setEmotion(emotion: any) {
    this.applyEmotion(String(emotion));
  }
}
