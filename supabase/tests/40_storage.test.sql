-- ============================================================
-- TEST 40: proof storage (S8) — private bucket, owner-only paths, images only
-- ============================================================
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

BEGIN;
SELECT tests.admin();
SELECT tests.make_player(:'alice', 'alice', 0);
SELECT tests.make_player(:'bob',   'bob',   0);

SELECT tests.ok('bucket exists and is PRIVATE', (SELECT NOT public FROM storage.buckets WHERE id = 'submissions'));
SELECT tests.ok('bucket limit is 5 MB',         (SELECT file_size_limit FROM storage.buckets WHERE id = 'submissions') = 5242880);
SELECT tests.ok('bucket allows only images',    (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'submissions') = ARRAY['image/jpeg','image/png','image/webp','image/gif']);

SELECT tests.login(:'alice');
SELECT tests.allowed('alice can upload into her own folder',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'alice' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'));
SELECT tests.denied('alice cannot write into bob''s folder',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'bob' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab.png'));
SELECT tests.denied('no script/executable extensions',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'alice' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac.php'));
SELECT tests.denied('no free-form file names',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'alice' || '/evil.png'));
SELECT tests.denied('no nested folders',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'alice' || '/x/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad.png'));
SELECT tests.denied('no uploads to other buckets',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('other', %L)$$, :'alice' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaae.png'));
SELECT tests.anon();
SELECT tests.denied('anon cannot upload',
  $$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', 'x/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaf.png')$$);
SELECT tests.denied('anon cannot read files', 'SELECT 1 / (SELECT COUNT(*) FROM storage.objects)');

SELECT tests.login(:'bob');
SELECT tests.ok('bob cannot see alice''s file', (SELECT COUNT(*) FROM storage.objects) = 0);
DELETE FROM storage.objects;                        -- RLS filters to bob's own (none)
SELECT tests.admin();
SELECT tests.ok('bob could not delete alice''s file', (SELECT COUNT(*) FROM storage.objects) = 1);

ROLLBACK;
