/** The same retry identifier may only acknowledge the exact original payload. */
export function samePayload(saved:unknown[],submitted:unknown[]):boolean{return JSON.stringify(saved)===JSON.stringify(submitted);}
export function scopedSaveKey(user:{userId:string;legacyUserId:string},requestKey:string){const scope=user.userId.startsWith('crew-profile:')?user.userId:user.legacyUserId;return `${scope}:${requestKey}`;}
