export const PROFILE_STORAGE_KEY='wod-crew-profile-key';
export const PROFILE_HEADER='X-WOD-Crew-Profile';
let memoryKey='';
const pattern=/^wc_[A-Za-z0-9_-]{32,80}$/;
export function validProfileKey(value){return typeof value==='string'&&pattern.test(value);}
export function createProfileKey(){return `wc_${crypto.randomUUID().replaceAll('-','')}`;}
function storage(){try{return globalThis.localStorage;}catch{return undefined;}}
/** @returns {string} */
export function getProfileKey(){
 const target=storage();let saved=null;try{saved=target?.getItem(PROFILE_STORAGE_KEY)??null;}catch{}
 if(validProfileKey(saved)){memoryKey=saved;return saved;}
 if(!validProfileKey(memoryKey))memoryKey=createProfileKey();
 try{target?.setItem(PROFILE_STORAGE_KEY,memoryKey);}catch{}
 return memoryKey;
}
export function restoreProfileKey(value){const clean=value.trim();if(!validProfileKey(clean))throw new Error('Enter a valid WOD Crew recovery key.');const target=storage();if(!target)throw new Error('Your browser is blocking storage. Allow site storage before restoring a profile.');try{target.setItem(PROFILE_STORAGE_KEY,clean);if(target.getItem(PROFILE_STORAGE_KEY)!==clean)throw new Error();}catch{throw new Error('Your browser could not save this recovery key. Free storage or allow site storage, then try again.');}memoryKey=clean;return clean;}
