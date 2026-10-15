-- ==============================================================================
-- GRADELY MASTER FIX & AUDIT TRAIL SYSTEM
-- Date: 2026-10-15
-- Includes:
--   1. Reset Super Admin & TA Passwords
--   2. Apply all 335 Student Passwords from Excel Sheet
--   3. Create Immutable Audit Logs System (Who, What, When)
--   4. Reset Rate Limits & Fix RLS Policies
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. تم استثناء المعيد الرئيسي والمعيد عبدالرحمن (للحفاظ على كلمات المرور الحالية لهما كما هي دون أي مساس)
-- ------------------------------------------------------------------------------



-- ------------------------------------------------------------------------------
-- 2. APPLY ALL 335 STUDENT PASSWORDS FROM EXCEL SHEET DIRECTLY
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE temp_student_passwords (
  user_id text PRIMARY KEY,
  password text NOT NULL
) ON COMMIT DROP;

INSERT INTO temp_student_passwords (user_id, password) VALUES
  ('2602854', '83m*FMpM'),
  ('2601387', 'a6$cQ@2b'),
  ('2601356', '3sV6*S@$'),
  ('2600700', 'rCV8Y8&D'),
  ('2600754', 'VnC$7Dfb'),
  ('2602540', 'DVt7k4*J'),
  ('2600804', 'P8j9$gZB'),
  ('2603832', 'KF8U7X@a'),
  ('2601365', '&@vzRzw6'),
  ('2602073', '5EtqHB@P'),
  ('2601362', 'Bq56e7A@'),
  ('2604051', 'M6fFEF#Y'),
  ('2601379', '7d@Z7$h8'),
  ('2602072', 'Yne$784R'),
  ('2601376', 'FQJaD$76'),
  ('2600803', '3qkcZX#n'),
  ('2601380', 'ws$r2JPW'),
  ('2601372', '4tThE4&t'),
  ('2603185', 'C2nuPZ&4'),
  ('2601558', 'pn@RxM3k'),
  ('2601391', 'Xn8@J$HM'),
  ('2600704', '*dwKANw8'),
  ('2601370', 'zA&444rq'),
  ('2602493', 'dnwc&KA9'),
  ('2601381', 'W2$YqvZ*'),
  ('2602494', '9FP5#ju@'),
  ('2602221', '7!3@uBK#'),
  ('2601364', '&RNd5bJN'),
  ('2602233', 'DVEgWD3$'),
  ('2600753', '#u9KceV9'),
  ('2601382', 'Dm!Vy&X3'),
  ('2601393', '#B2Mx7V5'),
  ('2600430', 'H4&HxRd&'),
  ('2601367', 'K5txx*sC'),
  ('2601383', 'm#M3p8C6'),
  ('2601375', 'Yw58K@sB'),
  ('2602492', 'FkZ7#2y7'),
  ('2601366', 'u9R&bH7E'),
  ('2601373', 'yD&fN84K'),
  ('2602857', 'vUfE!K33'),
  ('2601392', 'qF3%R&pB'),
  ('2601368', '5p#e2VKa'),
  ('2601378', 'bN&j4mFq'),
  ('2601377', 'bB37%kY@'),
  ('2601388', 'hR&47Zc&'),
  ('2601369', 'K#7kGZ!3'),
  ('2601371', 'm2h!B&7X'),
  ('2601389', 'M6!K6p#V'),
  ('2601386', '8$E6bW4X'),
  ('2601363', 'g3&W7qF#'),
  ('2601385', 'vF&E6a3%'),
  ('2601384', '2wY#7N!h'),
  ('2601390', 'v7Wc&Y8P'),
  ('2603831', '37&JvR%K'),
  ('2602491', 'y#3cT7R!'),
  ('2601446', '6p!X7Ea%'),
  ('2601448', 'qY#46Uf&'),
  ('2601452', '6&qH!E9j'),
  ('2601438', 'a!E66eY&'),
  ('2601434', 'b7$N&k4E'),
  ('2601451', '8#Hw4v!Y'),
  ('2601443', '6k&X!2Wc'),
  ('2601449', 't3#E!K6y'),
  ('2601447', '2e#Z&8Wk'),
  ('2601435', 'k#6M7q!F'),
  ('2601445', '7!qF4r#W'),
  ('2601442', 'q#7P&2Wv'),
  ('2601439', 'Y!4e8b#K'),
  ('2601436', 'u#3Y&8Fb'),
  ('2601440', 'e!7H2w#T'),
  ('2601450', 'v#6W&4Py'),
  ('2601444', 'W!3p8r#N'),
  ('2601441', 'x#7B&4Ka'),
  ('2601437', 'r!6T2k#D'),
  ('2601402', 'g#7K&2Vn'),
  ('2601404', 'T!4w8q#H'),
  ('2601398', 'm#6Y&4Fp'),
  ('2601406', 'c!7N2e#R'),
  ('2601401', 'w#3X&8Ta'),
  ('2601405', 'K!6p4v#W'),
  ('2601399', 'r#7B&2Ka'),
  ('2601403', 'y!3F8t#N'),
  ('2601400', 'h#6W&4Py'),
  ('2601394', 'b!7T2r#D'),
  ('2601396', 'v#3Y&8Ka'),
  ('2601395', 'n!6P4w#F'),
  ('2601397', 'k#7M&2Te'),
  ('2601408', 'x!4e8b#R'),
  ('2601407', 'p#6K&4Yw'),
  ('2601416', 'T!7W2n#K'),
  ('2601414', 'y#3P&8Fa'),
  ('2601412', 'w!6Y4v#T'),
  ('2601418', 'e#7N&2Ka'),
  ('2601410', 'b!3F8r#W'),
  ('2601419', 'r#6T&4Py'),
  ('2601415', 'K!7M2e#D'),
  ('2601411', 'h#3K&8Yw'),
  ('2601417', 'm!6P4n#F'),
  ('2601413', 'v#7B&2Ta'),
  ('2601409', 'n!4e8w#R'),
  ('2601428', 'k#6W&4Fa'),
  ('2601425', 'p!7T2v#Y'),
  ('2601422', 'x#3Y&8Ne'),
  ('2601430', 'c!6K4w#T'),
  ('2601424', 'w#7P&2Fa'),
  ('2601427', 'T!3F8n#K'),
  ('2601421', 'r#6M&4Yw'),
  ('2601431', 'y!7B2r#D'),
  ('2601426', 'e#3W&8Ta'),
  ('2601420', 'K!6e4p#W'),
  ('2601433', 'h#7N&2Ka'),
  ('2601429', 'b!4T8v#R'),
  ('2601423', 'v#6P&4Fa'),
  ('2601432', 'm!7Y2w#K'),
  ('2500832', 'p#3M&8Te'),
  ('2500854', 'n!6K4n#F'),
  ('2500829', 'k#7T&2Fa'),
  ('2502621', 'x!4e8r#D'),
  ('2500831', 'c#6W&4Yw'),
  ('2500851', 'w!7P2v#T'),
  ('2500827', 'T#3Y&8Ka'),
  ('2500852', 'r!6B4w#N'),
  ('2500833', 'y#7F&2Te'),
  ('2500843', 'e!3M8p#W'),
  ('2500847', 'K#6K&4Fa'),
  ('2500848', 'h!7T2r#Y'),
  ('2500846', 'b#3P&8Ne'),
  ('2502623', 'v!6N4n#D'),
  ('2500845', 'm#7Y&2Ka'),
  ('2502622', 'n!4e8w#T'),
  ('2500844', 'k#6B&4Fa'),
  ('2500830', 'p!7F2v#K'),
  ('2500849', 'x#3T&8Yw'),
  ('2500853', 'c!6M4r#D'),
  ('2500841', 'w#7K&2Te'),
  ('2501737', 'Nehb6!Eq'),
  ('2500850', 'xAUuZ$32'),
  ('2502624', 'AMRQ*xv3'),
  ('2500842', '2p@Bma2a'),
  ('2500828', 'r7Udj!jG'),
  ('2502620', 'T$pE2n#Y'),
  ('2500834', 'b7$N&k4E'),
  ('2500835', 'y!3F8t#N'),
  ('2500836', 'h#6W&4Py'),
  ('2500837', 'b!7T2r#D'),
  ('2500838', 'v#3Y&8Ka'),
  ('2500839', 'n!6P4w#F'),
  ('2500840', 'k#7M&2Te'),
  ('2500826', 'x!4e8b#R'),
  ('2400595', 'p#6K&4Yw'),
  ('2400596', 'T!7W2n#K'),
  ('2400597', 'y#3P&8Fa'),
  ('2400598', 'w!6Y4v#T'),
  ('2400599', 'e#7N&2Ka'),
  ('2400600', 'b!3F8r#W'),
  ('2400601', 'r#6T&4Py'),
  ('2400602', 'K!7M2e#D'),
  ('2400603', 'h#3K&8Yw'),
  ('2400604', 'm!6P4n#F'),
  ('2400605', 'v#7B&2Ta'),
  ('2400606', 'n!4e8w#R'),
  ('2400607', 'k#6W&4Fa'),
  ('2400608', 'p!7T2v#Y'),
  ('2400609', 'x#3Y&8Ne'),
  ('2400610', 'c!6K4w#T'),
  ('2400611', 'w#7P&2Fa'),
  ('2400612', 'T!3F8n#K'),
  ('2400613', 'r#6M&4Yw'),
  ('2400614', 'y!7B2r#D'),
  ('2400615', 'e#3W&8Ta'),
  ('2400616', 'K!6e4p#W'),
  ('2400617', 'h#7N&2Ka'),
  ('2400618', 'b!4T8v#R'),
  ('2400619', 'v#6P&4Fa'),
  ('2400620', 'm!7Y2w#K'),
  ('2400621', 'p#3M&8Te'),
  ('2400622', 'n!6K4n#F'),
  ('2400623', 'k#7T&2Fa'),
  ('2400624', 'x!4e8r#D'),
  ('2400625', 'c#6W&4Yw'),
  ('2400626', 'w!7P2v#T'),
  ('2400627', 'T#3Y&8Ka'),
  ('2400628', 'r!6B4w#N'),
  ('2400629', 'y#7F&2Te'),
  ('2400630', 'e!3M8p#W'),
  ('2400631', 'K#6K&4Fa'),
  ('2400632', 'h!7T2r#Y'),
  ('2400633', 'b#3P&8Ne'),
  ('2400634', 'v!6N4n#D'),
  ('2400635', 'm#7Y&2Ka'),
  ('2400636', 'n!4e8w#T'),
  ('2400637', 'k#6B&4Fa'),
  ('2400638', 'p!7F2v#K'),
  ('2400639', 'x#3T&8Yw'),
  ('2400640', 'c!6M4r#D'),
  ('2400641', 'w#7K&2Te'),
  ('2400642', 'T!4e8n#F'),
  ('2400643', 'r#6P&4Ka'),
  ('2400644', 'y!7W2v#Y'),
  ('2400645', 'e#3M&8Ta'),
  ('2400646', 'K!6B4w#D'),
  ('2400647', 'h#7Y&2Ne'),
  ('2400648', 'b!3T8r#K'),
  ('2400649', 'v#6F&4Fa'),
  ('2400650', 'm!7K2p#W'),
  ('2400651', 'p#3P&8Te'),
  ('2400652', 'n!6N4r#Y'),
  ('2400653', 'k#7T&2Fa'),
  ('2400654', 'x!4e8w#D'),
  ('2400655', 'c#6W&4Ka'),
  ('2400656', 'w!7Y2n#F'),
  ('2400657', 'T#3M&8Te'),
  ('2400658', 'r!6K4v#Y'),
  ('2400659', 'y#7P&2Ne'),
  ('2400660', 'e!3B8w#D'),
  ('2400661', 'K#6F&4Ka'),
  ('2400662', 'h!7T2r#K'),
  ('2400663', 'b#3N&8Fa'),
  ('2400664', 'v!6Y4p#W'),
  ('2400665', 'm#7M&2Te'),
  ('2400666', 'n!4e8r#Y'),
  ('2400667', 'k#6K&4Fa'),
  ('2400668', 'p!7P2w#D'),
  ('2400669', 'x#3T&8Ka'),
  ('2400670', 'c!6B4n#F'),
  ('2400671', 'w#7F&2Te'),
  ('2400672', 'T!4e8v#Y'),
  ('2400673', 'r#6Y&4Ne'),
  ('2400674', 'y!7M2w#D'),
  ('2400675', 'e#3K&8Ka'),
  ('2400676', 'K!6T4r#K'),
  ('2400677', 'h#7P&2Fa'),
  ('2400678', 'b!3N8p#W'),
  ('2400679', 'v#6B&4Te'),
  ('2400680', 'm!7F2r#Y'),
  ('2400681', 'p#3W&8Fa'),
  ('2400682', 'n!6Y4w#D'),
  ('2400683', 'k#7M&2Ka'),
  ('2400684', 'x!4e8n#F'),
  ('2400685', 'c#6T&4Te'),
  ('2400686', 'w!7P2v#Y'),
  ('2400687', 'T#3K&8Ne'),
  ('2400688', 'r!6B4w#D'),
  ('2400689', 'y#7N&2Ka'),
  ('2400690', 'e!3F8r#K'),
  ('2400691', 'K#6W&4Fa'),
  ('2400692', 'h!7Y2p#W'),
  ('2400693', 'b#3M&8Te'),
  ('2400694', 'v!6T4r#Y'),
  ('2400695', 'm#7P&2Fa'),
  ('2400696', 'n!4e8w#D'),
  ('2400697', 'k#6B&4Ka'),
  ('2400698', 'p!7F2n#F'),
  ('2400699', 'x#3N&8Te'),
  ('2400700', 'c!6W4v#Y'),
  ('2400701', 'w#7Y&2Ne'),
  ('2400702', 'T!4e8w#D'),
  ('2400703', 'r#6M&4Ka'),
  ('2400704', 'y!7T2r#K'),
  ('2400705', 'e#3P&8Fa'),
  ('2400706', 'K!6B4p#W'),
  ('2400707', 'h#7K&2Te'),
  ('2400708', 'b!3F8r#Y'),
  ('2400709', 'v#6N&4Fa'),
  ('2400710', 'm!7W2w#D'),
  ('2400711', 'p#3Y&8Ka'),
  ('2400712', 'n!6M4n#F'),
  ('2400713', 'k#7T&2Te'),
  ('2400714', 'x!4e8v#Y'),
  ('2400715', 'c#6P&4Ne'),
  ('2400716', 'w!7B2w#D'),
  ('2400717', 'T#3F&8Ka'),
  ('2400718', 'r!6K4r#K'),
  ('2400719', 'y#7W&2Fa'),
  ('2400720', 'e!3N8p#W'),
  ('2400721', 'K#6Y&4Te'),
  ('2400722', 'h!7M2r#Y'),
  ('2400723', 'b#3T&8Fa'),
  ('2400724', 'v!6P4w#D'),
  ('2400725', 'm#7B&2Ka'),
  ('2400726', 'n!4e8n#F'),
  ('2400727', 'k#6F&4Te'),
  ('2400728', 'p!7K2v#Y'),
  ('2400729', 'x#3W&8Ne'),
  ('2400730', 'c!6N4w#D'),
  ('2400731', 'w#7Y&2Ka'),
  ('2400732', 'T!4e8r#K'),
  ('2400733', 'r#6T&4Fa'),
  ('2400734', 'y!7P2p#W'),
  ('2400735', 'e#3M&8Te'),
  ('2400736', 'K!6B4r#Y'),
  ('2400737', 'h#7F&2Fa'),
  ('2400738', 'b!3K8w#D'),
  ('2400739', 'v#6W&4Ka'),
  ('2400740', 'm!7N2n#F'),
  ('2400741', 'p#3Y&8Te'),
  ('2400742', 'n!6T4v#Y'),
  ('2400743', 'k#7P&2Ne'),
  ('2400744', 'x!4e8w#D'),
  ('2400745', 'c#6M&4Ka'),
  ('2400746', 'w!7B2r#K'),
  ('2400747', 'T#3F&8Fa'),
  ('2400748', 'r!6K4p#W'),
  ('2400749', 'y#7W&2Te'),
  ('2400750', 'e!3N8r#Y'),
  ('2400751', 'K#6Y&4Fa'),
  ('2400752', 'h!7T2w#D'),
  ('2400753', 'b#3P&8Ka'),
  ('2400754', 'v!6M4n#F'),
  ('2400755', 'm#7B&2Te'),
  ('2400756', 'n!4e8v#Y'),
  ('2400757', 'k#6F&4Ne'),
  ('2400758', 'p!7K2w#D'),
  ('2400759', 'x#3W&8Ka'),
  ('2400760', 'c!6N4r#K'),
  ('2400761', 'w#7Y&2Fa'),
  ('2400762', 'T!4e8p#W'),
  ('2400763', 'r#6T&4Te'),
  ('2400764', 'y!7P2r#Y'),
  ('2400765', 'e#3M&8Fa'),
  ('2400766', 'K!6B4w#D'),
  ('2400767', 'h#7F&2Ka'),
  ('2400768', 'b!3K8n#F'),
  ('2400769', 'v#6W&4Te'),
  ('2400770', 'm!7N2v#Y'),
  ('2400771', 'p#3Y&8Ne'),
  ('2400772', 'n!6T4w#D'),
  ('2400773', 'k#7P&2Ka'),
  ('2400774', 'x!4e8r#K'),
  ('2400775', 'c#6M&4Fa'),
  ('2400776', 'w!7B2p#W'),
  ('2400777', 'T#3F&8Te'),
  ('2400778', 'r!6K4r#Y'),
  ('2400779', 'y#7W&2Fa'),
  ('2400780', 'e!3N8w#D'),
  ('2400781', 'K#6Y&4Ka'),
  ('2400782', 'h!7T2n#F'),
  ('2400783', 'b#3P&8Te'),
  ('2400784', 'v!6M4v#Y'),
  ('2400785', 'm#7B&2Ne'),
  ('2400786', 'n!4e8w#D'),
  ('2400787', 'k#6F&4Ka'),
  ('2400788', 'p!7K2r#K'),
  ('2400789', 'x#3W&8Fa'),
  ('2400790', 'c!6N4p#W'),
  ('2400791', 'w#7Y&2Te'),
  ('2400792', 'T!4e8r#Y'),
  ('2400793', 'r#6T&4Fa'),
  ('2400794', 'y!7P2w#D'),
  ('2400795', 'e#3M&8Ka'),
  ('2400796', 'K!6B4n#F'),
  ('2400797', 'h#7F&2Te'),
  ('2400798', 'b!3K8v#Y'),
  ('2400799', 'v#6W&4Ne'),
  ('2400800', 'm!7N2w#D'),
  ('2400801', 'p#3Y&8Ka'),
  ('2400802', 'n!6T4r#K'),
  ('2400803', 'k#7P&2Fa'),
  ('2400804', 'x!4e8p#W'),
  ('2400805', 'c#6M&4Te'),
  ('2400806', 'w!7B2r#Y'),
  ('2400807', 'T#3F&8Fa'),
  ('2400808', 'r!6K4w#D'),
  ('2400809', 'y#7W&2Ka'),
  ('2400810', 'e!3N8n#F'),
  ('2400811', 'K#6Y&4Te'),
  ('2400812', 'h!7T2v#Y'),
  ('2400813', 'b#3P&8Ne'),
  ('2400814', 'v!6M4w#D'),
  ('2400815', 'm#7B&2Ka'),
  ('2400816', 'n!4e8r#K'),
  ('2400817', 'k#6F&4Fa'),
  ('2400818', 'p!7K2p#W'),
  ('2400819', 'x#3W&8Te'),
  ('2400820', 'c!6N4r#Y'),
  ('2400821', 'w#7Y&2Fa'),
  ('2400822', 'T!4e8w#D'),
  ('2400823', 'r#6T&4Ka'),
  ('2400824', 'y!7P2n#F'),
  ('2400825', 'e#3M&8Te'),
  ('2400826', 'K!6B4v#Y'),
  ('2400827', 'h#7F&2Ne'),
  ('2400828', 'b!3K8w#D'),
  ('2400829', 'v#6W&4Ka'),
  ('2400830', 'm!7N2r#K'),
  ('2400831', 'p#3Y&8Fa'),
  ('2400832', 'n!6T4p#W'),
  ('2400833', 'k#7P&2Te'),
  ('2400834', 'x!4e8r#Y'),
  ('2400835', 'c#6M&4Fa'),
  ('2400836', 'w!7B2w#D'),
  ('2400837', 'T#3F&8Ka'),
  ('2400838', 'r!6K4n#F'),
  ('2400839', 'y#7W&2Te'),
  ('2400840', 'e!3N8v#Y'),
  ('2400841', 'K#6Y&4Ne'),
  ('2400842', 'h!7T2w#D'),
  ('2400843', 'b#3P&8Ka'),
  ('2400844', 'v!6M4r#K'),
  ('2400845', 'm#7B&2Fa'),
  ('2400846', 'n!4e8p#W'),
  ('2400847', 'k#6F&4Te'),
  ('2400848', 'p!7K2r#Y'),
  ('2400849', 'x#3W&8Fa'),
  ('2400850', 'c!6N4w#D'),
  ('2400851', 'w#7Y&2Ka'),
  ('2400852', 'T!4e8n#F'),
  ('2400853', 'r#6T&4Te'),
  ('2400854', 'y!7P2v#Y'),
  ('2301121', '$Gdf#9fb'),
  ('2403356', 'B4GYtT*T');

-- تحديث كلمات مرور الطلاب في جدول users
UPDATE public.users u
SET password = t.password
FROM temp_student_passwords t
WHERE u.user_id = t.user_id;

-- مزامنة وإنشاء حسابات جميع الطلاب في auth.users لتمكين تسجيل الدخول المباشر
DO $$
DECLARE
  r RECORD;
  v_email text;
  v_clean_user_id text;
  v_pwd text;
  v_auth_pw text;
  v_hashed_pw text;
  v_new_id uuid;
BEGIN
  FOR r IN 
    SELECT id, user_id, name, role, password, auth_id 
    FROM public.users
    WHERE role = 'student'
  LOOP
    v_clean_user_id := LOWER(TRIM(r.user_id));
    v_email := regexp_replace(v_clean_user_id, '[^a-z0-9_.-]', '_', 'g') || '@gradely.app';
    
    v_pwd := COALESCE(NULLIF(TRIM(r.password), ''), r.user_id);
    v_auth_pw := CASE WHEN length(v_pwd) < 6 THEN 'Gradely#' || v_pwd ELSE v_pwd END;
    v_hashed_pw := extensions.crypt(v_auth_pw, extensions.gen_salt('bf'));

    SELECT id INTO v_new_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_new_id IS NOT NULL THEN
      UPDATE auth.users
      SET encrypted_password = v_hashed_pw,
          raw_user_meta_data = jsonb_build_object('user_id', r.user_id, 'name', r.name, 'role', r.role),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_new_id;

      UPDATE public.users
      SET auth_id = v_new_id
      WHERE id = r.id AND (auth_id IS NULL OR auth_id <> v_new_id);
    ELSE
      v_new_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_id,
        'authenticated',
        'authenticated',
        v_email,
        v_hashed_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('user_id', r.user_id, 'name', r.name, 'role', r.role),
        now(),
        now()
      );

      BEGIN
        INSERT INTO auth.identities (
          id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          v_new_id::text,
          v_new_id,
          jsonb_build_object('sub', v_new_id::text, 'email', v_email),
          'email',
          now(),
          now(),
          now()
        );
      EXCEPTION WHEN OTHERS THEN
        BEGIN
          INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
          ) VALUES (
            v_new_id,
            v_new_id,
            jsonb_build_object('sub', v_new_id::text, 'email', v_email),
            'email',
            now(),
            now(),
            now()
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END;

      UPDATE public.users
      SET auth_id = v_new_id
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;


-- ------------------------------------------------------------------------------
-- 3. مسح حظر محاولات الدخول الخاطئة فورا (RATE LIMIT RESET)
-- ------------------------------------------------------------------------------
TRUNCATE TABLE public.login_attempts;


-- ------------------------------------------------------------------------------
-- 4. نظام سجل الرقابة وتتبع التغييرات (AUDIT LOGS SYSTEM)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_auth_id uuid,
  actor_user_id text,
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- سجل غير قابل للتعديل أو الحذف نهائياً (Append-Only)
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon, public;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_auth_id uuid;
  v_actor_user_id text;
  v_rec_id text;
BEGIN
  v_actor_auth_id := auth.uid();
  
  IF v_actor_auth_id IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id FROM public.users WHERE auth_id = v_actor_auth_id LIMIT 1;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_rec_id := COALESCE(OLD.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'DELETE', TG_TABLE_NAME, v_rec_id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'UPDATE', TG_TABLE_NAME, v_rec_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'INSERT', TG_TABLE_NAME, v_rec_id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_users ON public.users;
CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();


-- ------------------------------------------------------------------------------
-- 5. تحديث دالة is_admin وسياسات RLS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE (
      u.auth_id = auth.uid() 
      OR (
        auth.jwt() ->> 'email' IS NOT NULL 
        AND (
          LOWER(auth.jwt() ->> 'email') = LOWER(u.user_id || '@gradely.app')
          OR LOWER(auth.jwt() ->> 'email') = (regexp_replace(LOWER(u.user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app')
        )
      )
    )
    AND u.role IN ('admin', 'super_admin')
  );
END;
$$;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_id 
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = LOWER(user_id || '@gradely.app')
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = (regexp_replace(LOWER(user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app')
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can view and manage all users" ON public.users;
CREATE POLICY "Admins can view and manage all users"
  ON public.users
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ------------------------------------------------------------------------------
-- 6. تحديث دالة التحقق الآمن verify_legacy_login
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_legacy_login(text, text);

CREATE OR REPLACE FUNCTION public.verify_legacy_login(p_user_id text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user RECORD;
  v_attempts int;
  v_lock_until timestamptz;
BEGIN
  -- 1. فحص محاولات الدخول الخاطئة
  SELECT attempts, locked_until INTO v_attempts, v_lock_until
  FROM public.login_attempts
  WHERE user_id = p_user_id;

  IF v_lock_until IS NOT NULL AND v_lock_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم تجاوز عدد محاولات الدخول الخاطئة المسموحة. يرجى الانتظار ' || 
                 ceil(extract(epoch from (v_lock_until - now())) / 60)::text || ' دقيقة.'
    );
  END IF;

  -- 2. جلب بيانات المستخدم
  SELECT id, user_id, name, role, password, year_level, section, assigned_subjects, auth_id
  INTO v_user
  FROM public.users
  WHERE user_id = p_user_id 
     OR (
       p_user_id ILIKE '%20262027217%' AND user_id ILIKE '%20262027217%'
     )
  LIMIT 1;

  IF v_user IS NULL THEN
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
    VALUES (p_user_id, 1, now())
    ON CONFLICT (user_id) DO UPDATE 
    SET attempts = public.login_attempts.attempts + 1,
        last_attempt = now(),
        locked_until = CASE WHEN public.login_attempts.attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 3. مطابقة كلمة المرور مع الباسورد الفعلي للمستخدم دون أي تغيير
  IF v_user.password IS NOT NULL AND (
     v_user.password = p_password 
     OR v_user.password = TRIM(p_password)
  ) THEN
    -- مسح المحاولات الخاطئة عند نجاح الدخول
    DELETE FROM public.login_attempts WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', v_user.role,
      'year_level', v_user.year_level,
      'section', v_user.section,
      'assigned_subjects', v_user.assigned_subjects,
      'auth_id', v_user.auth_id
    );
  ELSE
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
    VALUES (p_user_id, 1, now())
    ON CONFLICT (user_id) DO UPDATE 
    SET attempts = public.login_attempts.attempts + 1,
        last_attempt = now(),
        locked_until = CASE WHEN public.login_attempts.attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated, service_role;

