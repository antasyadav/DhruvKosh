import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MascotCenterStage } from './MascotCenterStage';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import ExpandableChatInput from './ExpandableChatInput';
import { useAppStore } from '../store';
import { useSpeech } from '../contexts/SpeechProvider';
import { MessageSquare, HelpCircle } from 'lucide-react';

import { VoiceService } from '../services/VoiceService';
import { API_BASE_URL } from '../config';

function getPolarFallback(message: string, mode: string) {
  const q = message.toLowerCase();
  
  if (mode === 'kid') {
    // Basic heuristics for offline quiz interactions
    if (q.includes('yes') || q.includes('true') || q.includes('right') || q.includes('penguin') || q.includes('antarctica')) {
      return {
        reply: "That's exactly right! You're a brilliant polar explorer! Great job!",
        animation: "QUIZ_CORRECT",
        emotion: "HAPPY"
      };
    }
    if (q.includes('no') || q.includes('false') || q.includes('wrong') || q.includes('bear')) {
      return {
        reply: "Oops, not quite! Polar bears are in the Arctic, not Antarctica! But don't worry, let's keep exploring!",
        animation: "QUIZ_WRONG",
        emotion: "SAD"
      };
    }
  }

  if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('who are you') || q.includes('namaste')) {
    return {
      reply: "Hello! I am Mavis, your 3D AI Polar Guide at NCPOR. Ask me anything about Antarctica, the Arctic, or India's polar research stations!",
      animation: "WAVE",
      emotion: "FRIENDLY"
    };
  }
  if (q.includes('larsen') || q.includes('ice') || q.includes('thinning') || q.includes('melt')) {
    return {
      reply: "Recent radar surveys show the Larsen C ice shelf is thinning at approximately 2 meters per year. This accelerated loss is driven by warm ocean currents melting the ice shelf from below.",
      animation: "EXPLAIN",
      emotion: "SERIOUS"
    };
  }
  if (q.includes('penguin') || q.includes('animal') || q.includes('bear') || q.includes('wildlife')) {
    return {
      reply: mode === 'kid'
        ? "In Antarctica, we have amazing Emperor and Adélie penguins! But fun fact: polar bears only live in the North Pole in the Arctic, not Antarctica!"
        : "Polar ecosystems host unique species like Emperor penguins, Weddell seals, and vast swarms of Antarctic krill, which form the bedrock of the polar food chain.",
      animation: "HAPPY",
      emotion: "HAPPY"
    };
  }
  if (q.includes('station') || q.includes('maitri') || q.includes('bharati') || q.includes('himadri')) {
    return {
      reply: "India operates two active research stations in Antarctica: Maitri and Bharati in the Larsemann Hills. In the Arctic, India operates Himadri station in Svalbard, Norway!",
      animation: "THANKFUL",
      emotion: "FRIENDLY"
    };
  }
  if (q.includes('why') || q.includes('how') || q.includes('quiz') || q.includes('test') || q.includes('study')) {
    return {
      reply: "By drilling deep ice cores, polar scientists extract ancient air bubbles trapped for thousands of years, giving us a time machine to understand Earth's climate history.",
      animation: "THINKING",
      emotion: "THINKING"
    };
  }
  return {
    reply: mode === 'kid'
      ? "That is a great polar science question! In Antarctica, scientists brave extreme -50°C cold to explore glaciers, sea ice, and celestial physics."
      : "NCPOR polar research expeditions collect glaciological, geological, and climate data to model global sea level changes and monsoonal teleconnections.",
    animation: "SPEAKING",
    emotion: "FRIENDLY"
  };
}

export const PolarGuide: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { addChatMessage, mascot } = useAppStore();
  const { startListening, stopListening, isListening } = useSpeech();

  // Menu and Mode state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'student' | 'kid' | 'researcher'>('student'); 
  // 'student' = Chat, 'kid' = Questions

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;
    addChatMessage('user', message, chatMode);

    // Immediate Thinking State
    (window as any).motionController?.play('THINKING');
    (window as any).motionController?.applyEmotion('THINKING');

    let replyData: { reply: string; animation?: string; emotion?: string; audio_base64?: string } | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 sec timeout (to allow high-quality TTS generation and LLM processing)

      const response = await fetch(`${API_BASE_URL}/api/generated/expedition/1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message, 
          user_type: chatMode,
          history: mascot.chatHistory 
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        replyData = await response.json();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn("API timeout (60s) — switching to built-in Polar Knowledge Engine");
      } else {
        console.warn("API offline — using built-in Polar Knowledge Engine:", err);
      }
    }

    // If server returned empty, fallback to rich offline polar knowledge engine
    if (!replyData || !replyData.reply) {
      replyData = getPolarFallback(message, chatMode);
    }

    addChatMessage('assistant', replyData.reply, chatMode);

    // 🚀 High Fidelity Facial Emotion & Body Animation
    const anim = replyData.animation || replyData.action || 'SPEAKING';
    const emotion = replyData.emotion || 'FRIENDLY';

    (window as any).motionController?.applyEmotion(emotion);
    (window as any).motionController?.play(anim);

    // 🚀 Audio Speech & Lip Sync
    if (replyData.audio_base64 && (window as any).lipSyncSystem) {
      (window as any).lipSyncSystem.playAudioFromBase64(replyData.audio_base64);
    } else {
      VoiceService.getInstance().speak(replyData.reply);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#030305] flex text-white font-sans">

      {/* 🌌 AMBIENT BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[#030305]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:60px_60px]"
          style={{ maskImage: 'radial-gradient(ellipse 80% 50% at 50% 100%, black 70%, transparent 100%)' }} 
        />
      </div>

      {/* 🟦 MASCOT STAGE */}
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
         <motion.div animate={{ y: -60 }} className="relative w-full h-full max-w-6xl flex items-center justify-center">
            <div className="w-full h-full pb-32"> 
               <MascotCenterStage className="w-full h-full" showRadialActions={false} />
            </div>
         </motion.div>
      </div>

      {/* 🟢 MAIN UI */}
      <div className="absolute inset-0 z-20 flex flex-col md:flex-row w-full h-full pointer-events-none">
        
        {/* Left Side Panel (Quiz mode) */}
        <div className="hidden lg:flex w-[400px] h-full relative z-30 pointer-events-auto p-6 pl-0 pt-0 flex-col">
          {chatMode === 'kid' ? <ChatHistoryPanel chatMode="kid" /> : null}
        </div>
        
        {/* Chat Input (Bottom Center) */}
        <div className="flex-1 flex flex-col justify-end pb-6 px-4 md:pb-12 md:px-8 z-30 pointer-events-none relative">
            
            {/* Mode Selection Popup (above the Grip button) */}
            <div className="w-full max-w-3xl mx-auto flex justify-start pointer-events-auto relative">
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    className="absolute bottom-[80px] left-0 md:bottom-[90px] p-2 bg-black/80 backdrop-blur-3xl border border-white/20 rounded-[24px] shadow-2xl flex flex-col gap-2 min-w-[160px]"
                  >
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/50 font-bold">Select Mode</div>
                    <button 
                      onClick={() => { setChatMode('student'); setIsMenuOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-[16px] text-sm font-bold transition-all ${chatMode === 'student' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/80 hover:bg-white/10'}`}
                    >
                      <MessageSquare size={16} /> Chat
                    </button>
                    <button 
                      onClick={() => { setChatMode('kid'); setIsMenuOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-[16px] text-sm font-bold transition-all ${chatMode === 'kid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/80 hover:bg-white/10'}`}
                    >
                      <HelpCircle size={16} /> Kid Quiz
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="pointer-events-auto flex justify-center w-full mt-2">
                <ExpandableChatInput
                  onSendMessage={handleSendMessage}
                  isOpen={isMenuOpen}
                  onMenuToggle={() => setIsMenuOpen(!isMenuOpen)}
                />
            </div>
        </div>
        
        {/* Right Side Panel (Chat mode) */}
        <div className="hidden xl:flex w-[400px] h-full p-6 pr-0 pt-0 flex-col relative z-30 pointer-events-auto">
          {chatMode !== 'kid' ? <ChatHistoryPanel chatMode={chatMode} /> : null}
        </div>
      </div>

    </div>
  );
};

export default PolarGuide;
