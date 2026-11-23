// Old gateway aliases share their stable save prefix until they are linked to a browser profile.
export const memberKey="CASE WHEN user_id GLOB 'crew-profile:*' THEN user_id WHEN request_key GLOB 'sites-email:*:*' THEN substr(request_key,1,76) ELSE user_id END";
export const rosterQuery='SELECT id AS member_id,name AS athlete FROM crew_members';
// New records aggregate directly by their selected calendar date. Only legacy
// timestamps need timezone conversion in the server; they are never rewritten.
export const dailyActivityQuery='SELECT member_id,performed_on AS day,COUNT(*) AS count FROM attempts WHERE performed_on IS NOT NULL GROUP BY member_id,performed_on UNION ALL SELECT member_id,created_at AS day,COUNT(*) AS count FROM attempts WHERE performed_on IS NULL GROUP BY member_id,created_at';
export function statsQuery(boundaries:string[]){
 const cases=boundaries.slice(1).map((_,i)=>`WHEN created_at < ? THEN ${i}`).join(' ');
 return {sql:`SELECT member_id,CASE ${cases} END AS bucket,COUNT(*) AS count FROM attempts WHERE created_at >= ? AND created_at < ? GROUP BY member_id,bucket`,params:[...boundaries.slice(1),boundaries[0],boundaries.at(-1)!]};
}
