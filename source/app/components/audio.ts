'use client';
import type {Cue} from '../../lib/audio-cues';
let audio:AudioContext|null=null;
let speechReady=false;
export function unlockAudio(){
 try{const Audio=window.AudioContext||(window as any).webkitAudioContext;if(!audio&&Audio)audio=new Audio();void audio?.resume().catch(()=>{});
 // Unlock iOS audio from the Start/Test button gesture.
 if(audio){const buffer=audio.createBuffer(1,1,audio.sampleRate),source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);source.start();}
 if(!speechReady&&'speechSynthesis' in window){const u=new SpeechSynthesisUtterance('');u.volume=0;window.speechSynthesis.speak(u);speechReady=true;}
 }catch{}
}
function tone(hz:number,offset:number,duration:number,volume=.22){
 if(!audio||audio.state!=='running')return;
 const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+offset;o.type='sine';o.frequency.value=hz;o.connect(g);g.connect(audio.destination);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
}
export function silenceVoice(){try{window.speechSynthesis?.cancel();}catch{}}
export function playCue(cue:Cue,round?:number){
 try{
 const patterns:Record<Cue,number[]>={ready:[440,660],work:[660,880,1100],rest:[660,440],tick:[880],finish:[523,659,784,1047],pause:[440],resume:[660,880]};
 patterns[cue].forEach((hz,i)=>tone(hz,i*.11,cue==='tick'?.10:cue==='finish'?.35:.22));
 if(cue==='tick')return;
 const words:Record<Exclude<Cue,'tick'>,string>={ready:'Get ready',work:round&&round>1?`Start. Interval ${round}`:'Start',rest:'Rest',finish:'Workout complete. Well done!',pause:'Paused',resume:'Resume'};
 if('speechSynthesis' in window){silenceVoice();const u=new SpeechSynthesisUtterance(words[cue]);u.lang='en-GB';u.rate=1.05;u.volume=1;const voices=window.speechSynthesis.getVoices();const voice=voices.find(v=>v.lang==='en-GB')??voices.find(v=>v.lang.startsWith('en'));if(voice)u.voice=voice;window.speechSynthesis.speak(u);}
 }catch{}
}
