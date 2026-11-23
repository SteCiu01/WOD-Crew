import {database} from './server';
import {normalizeMemberName,backfillMembers} from './member-store';

export function memberName(value:unknown){
 return normalizeMemberName(value);
}

// Seed the roster from historic attempts and attach their stable member IDs.
// In particular, attempts from two browser profiles with the same name become one member.
export async function syncLegacyMembers(){
 await backfillMembers(database());
}

export async function selectedMember(id:unknown){
 if(!Number.isSafeInteger(id)||Number(id)<1)throw new Error('Choose a crew member before logging a result.');
 const member=await database().prepare('SELECT id,name FROM crew_members WHERE id=? AND archived_at IS NULL').bind(id).first<{id:number;name:string}>();
 if(!member)throw new Error('This crew member was removed. Choose another member.');
 return member;
}
