-- ============================================================
-- データベースのセキュリティテスト（何度実行しても安全）
-- Supabase の SQL Editor に貼って実行する。テスト用データは最後に必ず削除される。
-- 結果の表で result が 'FAIL' で始まる行があれば、その守りが壊れている。
-- ============================================================
drop table if exists t_results;
create temp table t_results (n serial, test text, result text);
grant all on t_results to authenticated, anon;
grant usage, select on sequence t_results_n_seq to authenticated, anon;

insert into public.profiles (id, username, display_name, provider, provider_id) values
 ('aaaaaaaa-0000-4000-8000-000000000001','test_a','テストA','test','test-a'),
 ('bbbbbbbb-0000-4000-8000-000000000002','test_b','テストB','test','test-b'),
 ('cccccccc-0000-4000-8000-000000000003','test_c','テストC','test','test-c'),
 ('dddddddd-0000-4000-8000-000000000004','test_d','テストD','test','test-d');
update public.profiles set is_banned = true where id = 'dddddddd-0000-4000-8000-000000000004';
-- サーバー（/api/room/private）が行う処理の再現：A の友達部屋、A に入室権
insert into public.rooms (id, name, is_private, invite_code, created_by)
  values ('eeeeeeee-0000-4000-8000-00000000000e','テスト部屋',true,'TESTCODE99','aaaaaaaa-0000-4000-8000-000000000001');
insert into public.room_access (room_id, user_id) values ('eeeeeeee-0000-4000-8000-00000000000e','aaaaaaaa-0000-4000-8000-000000000001');

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  C uuid := 'cccccccc-0000-4000-8000-000000000003';
  D uuid := 'dddddddd-0000-4000-8000-000000000004';
  R uuid := 'eeeeeeee-0000-4000-8000-00000000000e';
  PUB uuid := '00000000-0000-0000-0000-000000000006';
  fid uuid; n int;
begin
  execute 'set local role authenticated';

  -- ── フレンド ──
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role','authenticated')::text, true);
  begin insert into public.friendships (requester_id, addressee_id, status) values (A, B, 'pending') returning id into fid;
    insert into t_results(test,result) values ('フレンド申請 A→B','OK');
  exception when others then insert into t_results(test,result) values ('フレンド申請 A→B','FAIL: '||sqlerrm); end;
  begin update public.friendships set status='accepted' where id = fid;
    insert into t_results(test,result) values ('[攻撃] 申請者が自分で承認','FAIL 通った');
  exception when others then insert into t_results(test,result) values ('[攻撃] 申請者が自分で承認','OK 拒否'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role','authenticated')::text, true);
  begin update public.friendships set status='accepted' where id = fid;
    insert into public.friendships (requester_id, addressee_id, status) values (B, A, 'accepted')
      on conflict (requester_id, addressee_id) do update set status='accepted';
    insert into t_results(test,result) values ('B が承認','OK');
  exception when others then insert into t_results(test,result) values ('B が承認','FAIL: '||sqlerrm); end;

  -- ── メッセージ ──
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role','authenticated')::text, true);
  begin insert into public.messages (sender_id, receiver_id, content) values (A, B, 'こんにちは');
    insert into t_results(test,result) values ('フレンドどうしのメッセージ','OK');
  exception when others then insert into t_results(test,result) values ('フレンドどうしのメッセージ','FAIL: '||sqlerrm); end;
  begin insert into public.messages (sender_id, receiver_id, content) values (B, A, 'なりすまし');
    insert into t_results(test,result) values ('[攻撃] 他人になりすましてメッセージ','FAIL 通った');
  exception when others then insert into t_results(test,result) values ('[攻撃] 他人になりすましてメッセージ','OK 拒否'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role','authenticated')::text, true);
  select count(*) into n from public.messages where sender_id = A;
  insert into t_results(test,result) values ('[盗み見] 第三者が他人の会話を読む', case when n=0 then 'OK 見えない' else 'FAIL 見えた' end);
  begin insert into public.messages (sender_id, receiver_id, content) values (C, A, '偽の招待 /invite/TESTCODE99');
    insert into t_results(test,result) values ('[攻撃] フレンド以外からメッセージ','FAIL 届いた');
  exception when others then insert into t_results(test,result) values ('[攻撃] フレンド以外からメッセージ','OK 拒否'); end;

  -- ── プロフィール ──
  begin update public.profiles set role='admin', is_banned=false, total_study_seconds=999999, display_name='乗っ取り' where id in (A, C);
  exception when others then null; end;
  execute 'reset role';
  select count(*) into n from public.profiles where (id = C and (role='admin' or total_study_seconds=999999 or display_name='乗っ取り')) or (id = A and display_name='乗っ取り');
  execute 'set local role authenticated';
  insert into t_results(test,result) values ('[攻撃] 管理者昇格・時間水増し・名前の直接書き換え', case when n=0 then 'OK 保護' else 'FAIL' end);
  begin perform provider_id from public.profiles limit 1;
    insert into t_results(test,result) values ('[盗み見] 他人のログイン ID（provider_id）を読む','FAIL 読めた');
  exception when others then insert into t_results(test,result) values ('[盗み見] 他人のログイン ID（provider_id）を読む','OK 拒否'); end;
  select count(*) into n from public.profiles where id = A;
  insert into t_results(test,result) values ('ログイン済みなら他人の公開プロフィールは見える', case when n=1 then 'OK' else 'FAIL '||n end);
  begin insert into public.study_sessions (user_id, duration_seconds) values (C, 99999);
    insert into t_results(test,result) values ('[攻撃] 勉強記録の直接追加','FAIL 通った');
  exception when others then insert into t_results(test,result) values ('[攻撃] 勉強記録の直接追加','OK 拒否'); end;
  begin perform public.ban_user(A, 'x');
    insert into t_results(test,result) values ('[攻撃] 一般ユーザーが BAN','FAIL 通った');
  exception when others then insert into t_results(test,result) values ('[攻撃] 一般ユーザーが BAN','OK 拒否'); end;

  -- ── 部屋・カメラ ──
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role','authenticated')::text, true);
  begin insert into public.room_members (room_id, user_id) values (R, A);
    insert into t_results(test,result) values ('作成者が友達部屋に入室','OK');
  exception when others then insert into t_results(test,result) values ('作成者が友達部屋に入室','FAIL: '||sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role','authenticated')::text, true);
  select count(*) into n from public.rooms where id = R;
  insert into t_results(test,result) values ('[盗み見] 招待なしで友達部屋を見る', case when n=0 then 'OK 見えない' else 'FAIL 見えた' end);
  select count(*) into n from public.room_members where room_id = R;
  insert into t_results(test,result) values ('[盗み見] 招待なしで在室者を見る', case when n=0 then 'OK 見えない' else 'FAIL 見えた' end);
  begin insert into public.room_members (room_id, user_id) values (R, C);
    insert into t_results(test,result) values ('[攻撃] 招待なしで友達部屋に入り込む','FAIL 入れた');
  exception when others then insert into t_results(test,result) values ('[攻撃] 招待なしで友達部屋に入り込む','OK 拒否'); end;
  begin insert into public.room_access (room_id, user_id) values (R, C);
    insert into t_results(test,result) values ('[攻撃] 自分で入室権を付与','FAIL 通った');
  exception when others then insert into t_results(test,result) values ('[攻撃] 自分で入室権を付与','OK 拒否'); end;
  begin insert into public.webrtc_signals (room_id, from_user, to_user, type, payload) values (R, C, A, 'description', '{}');
    insert into t_results(test,result) values ('[攻撃] 部屋の外から他人のカメラに接続','FAIL 送れた');
  exception when others then insert into t_results(test,result) values ('[攻撃] 部屋の外から他人のカメラに接続','OK 拒否'); end;
  begin insert into public.room_members (room_id, user_id) values (PUB, C);
    insert into public.webrtc_signals (room_id, from_user, to_user, type, payload) values (PUB, C, A, 'description', '{}');
    insert into t_results(test,result) values ('[攻撃] 公開ルーム経由で別の部屋の人のカメラに接続','FAIL 送れた');
  exception when others then insert into t_results(test,result) values ('[攻撃] 公開ルーム経由で別の部屋の人のカメラに接続','OK 拒否'); end;
  begin insert into public.rooms (name, is_private, created_by) values ('勝手な部屋', false, C);
    insert into t_results(test,result) values ('[攻撃] サーバーを通さず部屋を作る','FAIL 作れた');
  exception when others then insert into t_results(test,result) values ('[攻撃] サーバーを通さず部屋を作る','OK 拒否'); end;

  -- ── ブロック ──
  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role','authenticated')::text, true);
  insert into public.blocks (blocker_id, blocked_id) values (B, A);
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role','authenticated')::text, true);
  begin insert into public.messages (sender_id, receiver_id, content) values (A, B, 'ブロック後');
    insert into t_results(test,result) values ('ブロックされた側からメッセージ','FAIL 届いた');
  exception when others then insert into t_results(test,result) values ('ブロックされた側からメッセージ','OK 拒否'); end;
  select count(*) into n from public.blocks where blocked_id = A;
  insert into t_results(test,result) values ('誰にブロックされたかは見えない', case when n=0 then 'OK 見えない' else 'FAIL 見えた' end);

  -- ── BAN ──
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role','authenticated')::text, true);
  begin insert into public.room_members (room_id, user_id) values (PUB, D);
    insert into t_results(test,result) values ('[BAN] BAN 中のユーザーが入室','FAIL 入れた');
  exception when others then insert into t_results(test,result) values ('[BAN] BAN 中のユーザーが入室','OK 拒否'); end;
  begin insert into public.friendships (requester_id, addressee_id, status) values (D, C, 'pending');
    insert into t_results(test,result) values ('[BAN] BAN 中のユーザーがフレンド申請','FAIL 通った');
  exception when others then insert into t_results(test,result) values ('[BAN] BAN 中のユーザーがフレンド申請','OK 拒否'); end;

  -- ── ログインしていない人（anon）──
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  begin perform 1 from public.profiles limit 1;
    insert into t_results(test,result) values ('[未ログイン] プロフィール一覧を読む','FAIL 読めた');
  exception when others then insert into t_results(test,result) values ('[未ログイン] プロフィール一覧を読む','OK 拒否'); end;
  begin perform 1 from public.rooms limit 1;
    insert into t_results(test,result) values ('[未ログイン] 部屋一覧を読む','FAIL 読めた');
  exception when others then insert into t_results(test,result) values ('[未ログイン] 部屋一覧を読む','OK 拒否'); end;
  begin perform 1 from public.tasks limit 1;
    insert into t_results(test,result) values ('[未ログイン] 共有タスクを読む','FAIL 読めた');
  exception when others then insert into t_results(test,result) values ('[未ログイン] 共有タスクを読む','OK 拒否'); end;
  begin insert into public.messages (sender_id, receiver_id, content) values (A, B, 'x');
    insert into t_results(test,result) values ('[未ログイン] メッセージを書き込む','FAIL 書けた');
  exception when others then insert into t_results(test,result) values ('[未ログイン] メッセージを書き込む','OK 拒否'); end;
  execute 'reset role';
end $$;

-- 後片付け（プロフィールを消すと、フレンド・メッセージ・ブロック・入室権も一緒に消える）
delete from public.rooms where id = 'eeeeeeee-0000-4000-8000-00000000000e' or (name = '勝手な部屋' and created_by = 'cccccccc-0000-4000-8000-000000000003');
delete from public.profiles where id in ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','cccccccc-0000-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000004');

select test, result from t_results order by n;
