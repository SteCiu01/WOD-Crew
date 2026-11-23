import unittest,sqlite3,re,pathlib
class PersistenceTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(pathlib.Path('drizzle').glob('*.sql')):self.db.executescript(f.read_text())
  source=pathlib.Path('app/api/wods/route.ts').read_text()
  self.insert=next(q for q in re.findall(r"prepare\('([^']+)'\)",source) if q.startswith('INSERT'))
 def insert_wod(self,key):
  self.db.execute("INSERT OR IGNORE INTO crew_members(id,name,name_key,created_at) VALUES(1,'Alex','alex','now')")
  values=[key,'user1','Alex',1,'{}','2026-10-06T12:00:00Z',key]
  self.db.execute(self.insert,values)
 def test_retry_is_idempotent_and_next_wod_number_is_sequential(self):
  self.insert_wod('same');self.insert_wod('same');self.insert_wod('next')
  self.assertEqual(self.db.execute('SELECT id FROM workouts ORDER BY id').fetchall(),[(1,),(2,)])
 def test_result_delete_is_author_only(self):
  self.insert_wod('one');self.db.execute("INSERT OR IGNORE INTO crew_members(id,name,name_key,created_at) VALUES(2,'Alice','alice','now')");self.db.execute("INSERT INTO attempts(request_key,wod_id,user_id,member_id,athlete,scores,source,style,notes,created_at) VALUES('r',1,'alice',2,'Alice','[]','manual','rx','','now')")
  src=pathlib.Path('app/api/results/route.ts').read_text();delete=next(q for q in re.findall(r"prepare\('([^']+)'\)",src) if q.startswith('DELETE'))
  self.db.execute(delete,(1,1));self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],1)
  self.db.execute(delete,(1,2));self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],0)
 def test_result_cannot_reference_missing_wod(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO attempts(request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES('x',999,'alice','Alice','[]','manual','rx','','now')")
 def test_creator_can_archive_and_restore_without_losing_results(self):
  self.insert_wod('one')
  self.db.execute("INSERT INTO attempts(request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES('r',1,'friend','Friend','[]','manual','rx','','now')")
  src=pathlib.Path('app/api/wods/route.ts').read_text()
  queries=re.findall(r"prepare\('([^']+)'\)",src)
  archive=next(q for q in queries if q.startswith('UPDATE workouts SET archived_at=?'))
  restore=next(q for q in queries if q.startswith('UPDATE workouts SET archived_at=NULL'))
  self.db.execute(archive,('now',1,2,'stranger','legacy-stranger','third-stranger'))
  self.assertIsNone(self.db.execute('SELECT archived_at FROM workouts WHERE id=1').fetchone()[0])
  self.db.execute(archive,('now',1,1,'user1','legacy-user1','third-user1'))
  self.assertEqual(self.db.execute('SELECT id FROM workouts WHERE archived_at IS NULL').fetchall(),[])
  self.assertEqual(self.db.execute('SELECT wod_id FROM attempts').fetchall(),[(1,)])
  self.db.execute(restore,(1,2,'stranger','legacy-stranger','third-stranger'))
  self.assertEqual(self.db.execute('SELECT archived_at FROM workouts WHERE id=1').fetchone()[0],'now')
  self.db.execute(restore,(1,1,'legacy-user1','user1','third-user1'))
  self.assertEqual(self.db.execute('SELECT id FROM workouts WHERE archived_at IS NULL').fetchall(),[(1,)])
  self.assertEqual(self.db.execute('SELECT wod_id FROM attempts').fetchall(),[(1,)])
 def test_edit_preserves_logged_date_and_count_and_requires_owner_and_version(self):
  self.insert_wod('one')
  self.db.execute("INSERT OR IGNORE INTO crew_members(id,name,name_key,created_at) VALUES(2,'Alice','alice','now')");self.db.execute("INSERT INTO attempts(request_key,wod_id,user_id,member_id,athlete,scores,source,style,notes,created_at) VALUES('r',1,'alice',2,'Alice','[]','manual','rx','','2026-10-01')")
  src=pathlib.Path('app/api/results/route.ts').read_text()
  updates=[q for q in re.findall(r"prepare\('([^']+)'\)",src) if q.startswith('UPDATE attempts')]
  self.assertTrue(updates,'Result editing is not implemented')
  update=updates[0]
  values=[2,'Alice','[]','scaled','20 kg','2026-10-08',None,1,1,1,'2026-10-01','{}']
  self.db.execute(update,values)
  self.assertEqual(self.db.execute('SELECT notes FROM attempts').fetchone()[0],'')
  values[9]=2;self.db.execute(update,values)
  self.assertEqual(self.db.execute('SELECT COUNT(*),created_at,notes FROM attempts').fetchone(),(1,'2026-10-01','20 kg'))
  values[4]='stale edit';self.db.execute(update,values)
  self.assertEqual(self.db.execute('SELECT notes FROM attempts').fetchone()[0],'20 kg')
 def test_authenticated_legacy_history_is_linked_to_recovery_profile(self):
  self.db.setlimit(sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH,50)
  stable='sites-email:'+'a'*64;profile='crew-profile:'+'b'*64
  self.db.execute("INSERT INTO workouts(request_key,owner_id,creator,definition,created_at) VALUES(?,?,?,?,?)",(stable+':w','opaque-old','Alex','{}','2026-10-01'))
  self.db.execute("INSERT INTO attempts(request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES(?,1,?,?,?,?,?,?,?)",(stable+':r','opaque-old','Alex','[]','manual','rx','','2026-10-01'))
  source=pathlib.Path('lib/server.ts').read_text();queries=re.findall(r"prepare\([\"'](.*?)[\"']\)",source)
  attempt=next(q for q in queries if q.startswith('UPDATE attempts SET user_id='));workout=next(q for q in queries if q.startswith('UPDATE workouts SET owner_id='))
  values=(profile,'opaque-new',stable,stable+':',stable+':')
  self.db.execute(attempt,values);self.db.execute(workout,values)
  self.assertEqual(self.db.execute('SELECT user_id FROM attempts').fetchone()[0],profile)
  self.assertEqual(self.db.execute('SELECT owner_id FROM workouts').fetchone()[0],profile)
  other='crew-profile:'+'c'*64;other_values=(other,'opaque-new',stable,stable+':',stable+':')
  self.db.execute(attempt,other_values);self.db.execute(workout,other_values)
  self.assertEqual(self.db.execute('SELECT user_id FROM attempts').fetchone()[0],profile)
  self.assertEqual(self.db.execute('SELECT owner_id FROM workouts').fetchone()[0],profile)
if __name__=='__main__':unittest.main()
