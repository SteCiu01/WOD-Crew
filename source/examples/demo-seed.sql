-- Optional fictional content for a fresh database, after all six migrations.
-- No original users, workouts, results, identities, or recovery keys.
BEGIN;
INSERT INTO crew_members (id,name,name_key,created_at) VALUES
  (1,'Alex Demo','alex demo','2025-01-01T12:00:00.000Z'),
  (2,'Jamie Demo','jamie demo','2025-01-01T12:00:00.000Z');
INSERT INTO workouts (request_key,owner_id,creator,creator_member_id,definition,created_at) VALUES ('demo-workout-request-0001','demo-seed-owner','Alex Demo',1,'{"title":"Demo bodyweight session","notes":"Fictional example. Adapt the pace and movements to your ability.","prepare":10,"repeat":1,"blocks":[{"id":"demo-amrap-block","mode":"amrap","label":"Bodyweight AMRAP","duration":600,"rounds":1,"work":40,"rest":20,"restLabel":"Recover","exerciseFlow":"rotate","repeat":1,"exercises":[{"name":"Air squats","reps":"10 reps"},{"name":"Incline push-ups","reps":"5 reps"},{"name":"Step-ups","reps":"10 reps"}]}]}','2025-01-01T12:00:00.000Z');
COMMIT;
