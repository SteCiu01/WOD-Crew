export type Cue='ready'|'work'|'rest'|'tick'|'finish'|'pause'|'resume';
export function timerCue(phase:{kind:'work'|'rest'|'prepare'},remaining:number,entering:boolean):Cue|null{
 if(entering)return phase.kind==='prepare'?'ready':phase.kind==='rest'?'rest':'work';
 return remaining>=1&&remaining<=3?'tick':null;
}
