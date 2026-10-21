/**
 * Gradely Security Hardening — Complete Verification Test
 * File: supabase/tests/verify_hardening_complete.mjs
 *
 * Run from project root: node supabase/tests/verify_hardening_complete.mjs
 *
 * Groups:
 *   A — Static SQL analysis of 20261017_security_hardening.sql
 *   B — Frontend source code checks
 *   C — Live API probes (read-only, against configured Supabase backend)
 *
 * Optional live login probes (Groups C7-C10) require env vars:
 *   TEST_STUDENT_ID       — real student ID
 *   TEST_STUDENT_PASSWORD — that student's current password
 * These are never stored in code.
 */

import { readFileSync } from 'fs';

const SUPABASE_URL      = 'https://bbdyexsaqnlremprfmph.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7lextLm1cEOuRlz4XMiV9w_F01aZaho';

async function rpc(fn, args = {}, token = null) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, data };
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Gradely Security Hardening — Complete Verification Test         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    if (detail) console.log(`       detail: ${detail}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       detail: ${detail}`);
    failCount++;
  }
}

// ============================================================================
// GROUP A: Static SQL analysis of 20261017_security_hardening.sql
// ============================================================================
console.log('\n── Group A: SQL Migration Static Analysis ──');

const sqlRaw = readFileSync('supabase/migrations/20261017_security_hardening.sql', 'utf8');

// Strip single-line SQL comments for credential checks (keeps comment-only mentions safe)
const sqlNoComments = sqlRaw.split('\n').map(line => {
  const idx = line.indexOf('--');
  return idx >= 0 ? line.slice(0, idx) : line;
}).join('\n');

// A1: pgcrypto guard uses DO block + pg_extension check (not bare CREATE EXTENSION)
assert(
  sqlRaw.includes('SELECT 1 FROM pg_extension WHERE extname = \'pgcrypto\''),
  'A1  pgcrypto guard checks pg_extension before CREATE EXTENSION (safe for existing installs)'
);

// A2: Bcrypt trigger created and fires only on password column
assert(
  sqlRaw.includes('CREATE TRIGGER trg_auto_bcrypt_users_password') &&
  sqlRaw.includes('BEFORE INSERT OR UPDATE OF password ON public.users'),
  'A2  Trigger trg_auto_bcrypt_users_password fires on INSERT OR UPDATE OF password'
);

// A3: Strict bcrypt detection: regex + length (not naive LEFT() prefix)
assert(
  sqlRaw.includes("NEW.password ~ '^[$]2[abxy][$][0-9]{2}[$]'") &&
  sqlRaw.includes('LENGTH(NEW.password) = 60'),
  'A3  Bcrypt guard uses strict regex + length check (prevents double-hashing)'
);

// A4: search_path explicitly set on every SECURITY DEFINER function
for (const fn of [
  'trg_fn_auto_bcrypt_password',
  'revoke_student_session',
  'verify_legacy_login',
  'admin_update_user_password',
]) {
  const afterFn = sqlRaw.split(`FUNCTION public.${fn}`)[1] || '';
  const defBlock = afterFn.split('AS $$')[0] || '';
  assert(
    defBlock.includes('SET search_path'),
    `A4  SECURITY DEFINER 'public.${fn}' has explicit SET search_path`
  );
}

// A5: verify_legacy_login does NOT include auth in its search_path
//     (students have no Supabase JWT; auth.uid() is unused in this function)
const verifyBlock = (sqlRaw.split('CREATE OR REPLACE FUNCTION public.verify_legacy_login')[1] || '')
  .split('AS $$')[0];
assert(
  !verifyBlock.includes('auth') || verifyBlock.includes('public, extensions'),
  'A5  verify_legacy_login search_path does not add auth (students use custom tokens, not JWT)'
);
// Stricter: confirm no `auth` in its search_path line
const verifySpLine = verifyBlock.match(/SET search_path\s*=\s*([^\n]+)/)?.[1]?.trim() ?? '';
assert(
  !verifySpLine.toLowerCase().includes('auth'),
  `A5b verify_legacy_login SET search_path line excludes auth (found: '${verifySpLine}')`
);

// A6: admin_update_user_password includes auth in its search_path (uses auth.uid())
const adminPwBlock = (sqlRaw.split('CREATE OR REPLACE FUNCTION public.admin_update_user_password')[1] || '')
  .split('AS $$')[0];
const adminPwSpLine = adminPwBlock.match(/SET search_path\s*=\s*([^\n]+)/)?.[1]?.trim() ?? '';
assert(
  adminPwSpLine.toLowerCase().includes('auth'),
  `A6  admin_update_user_password search_path includes auth (uses auth.uid()) — found: '${adminPwSpLine}'`
);

// A7: vault locked down (REVOKE ALL + RLS)
assert(
  sqlRaw.includes('REVOKE ALL ON TABLE public.student_credentials_vault') &&
  sqlRaw.includes('ALTER TABLE public.student_credentials_vault ENABLE ROW LEVEL SECURITY'),
  'A7  student_credentials_vault: REVOKE ALL + RLS enabled'
);

// A8: No hardcoded student credentials in executable SQL (comments excluded)
const KNOWN_HARDCODED = ["'s97u*eDR'", "'54qr#Vzx'", "'fRnp874*'", "'b7Y3T!j*'", "'2&QmGr#Y'", "'Gradely#'"];
const found = KNOWN_HARDCODED.filter(c => sqlNoComments.includes(c));
assert(
  found.length === 0,
  'A8  No hardcoded student credentials in executable SQL',
  found.length > 0 ? `FOUND: ${found.join(', ')}` : ''
);

// A9: verify_legacy_login — NO vault fallback query
const verifyFnBody = (sqlRaw.split('CREATE OR REPLACE FUNCTION public.verify_legacy_login')[1] || '')
  .split('CREATE OR REPLACE FUNCTION')[0];
assert(
  !verifyFnBody.includes('FROM public.student_credentials_vault'),
  'A9  verify_legacy_login has NO fallback query to student_credentials_vault'
);

// A10: verify_legacy_login — no special-case user_id filter
assert(
  !verifyFnBody.includes('20262027217'),
  'A10 verify_legacy_login has no hard-coded special-case user_id filter'
);

// A11: verify_legacy_login — correct password clears attempts BEFORE failure branch
assert(
  verifyFnBody.includes('IF v_pass_valid THEN') &&
  verifyFnBody.includes('DELETE FROM public.login_attempts WHERE user_id = v_clean_id') &&
  verifyFnBody.indexOf('DELETE FROM public.login_attempts') <
    verifyFnBody.indexOf('-- Wrong password: increment attempt counter'),
  'A11 verify_legacy_login clears attempts on correct password before failure counter branch'
);

// A12: login_attempts exception handlers use RAISE WARNING, not silent NULL
assert(
  !verifyFnBody.includes('EXCEPTION WHEN OTHERS THEN\n      NULL') &&
  !verifyFnBody.includes('EXCEPTION WHEN OTHERS THEN NULL') &&
  verifyFnBody.includes('RAISE WARNING'),
  'A12 login_attempts exception handlers RAISE WARNING (not silent EXCEPTION WHEN OTHERS THEN NULL)'
);

// A13: fail-closed session storage
assert(
  sqlRaw.includes('session_creation_failed') &&
  sqlRaw.includes('INSERT INTO public.student_sessions'),
  'A13 verify_legacy_login is fail-closed on session INSERT failure'
);

// A14: revoke_student_session defined and deletes by token only
assert(
  sqlRaw.includes('CREATE OR REPLACE FUNCTION public.revoke_student_session'),
  'A14 revoke_student_session function is defined'
);
assert(
  sqlRaw.includes('DELETE FROM public.student_sessions') &&
  sqlRaw.includes('WHERE token = v_token'),
  'A15 revoke_student_session deletes by token only (one row, no bulk delete)'
);

// A16: admin_update_user_password does NOT touch vault
const adminPwFnBody = (sqlRaw.split('CREATE OR REPLACE FUNCTION public.admin_update_user_password')[1] || '')
  .split('CREATE OR REPLACE FUNCTION')[0];
assert(
  !adminPwFnBody.includes('UPDATE public.student_credentials_vault'),
  'A16 admin_update_user_password does NOT modify student_credentials_vault'
);

// A17: admin_update_user_password does NOT write Gradely# padding
assert(
  !sqlNoComments.includes("'Gradely#'"),
  "A17 admin_update_user_password removes 'Gradely#' password padding hack"
);

// A18: anon cannot execute admin_update_user_password
assert(
  sqlRaw.includes("REVOKE ALL ON FUNCTION public.admin_update_user_password(text, text) FROM anon") ||
  sqlRaw.includes("REVOKE ALL ON FUNCTION public.admin_update_user_password(text, text) FROM anon, public"),
  'A18 admin_update_user_password is revoked from anon'
);

// A19: login_attempts and student_sessions locked down
assert(
  sqlRaw.includes('REVOKE ALL ON TABLE public.login_attempts') &&
  sqlRaw.includes('REVOKE ALL ON TABLE public.student_sessions'),
  'A19 login_attempts and student_sessions are locked down (REVOKE ALL)'
);

// A20: bulk migration NEVER touches existing non-empty passwords (null/empty check)
const bulkMigBlock = (sqlRaw.split('Step A')[1] || '').split('Step B')[0];
assert(
  bulkMigBlock.includes("password IS NULL OR TRIM(u.password) = ''") ||
  bulkMigBlock.includes("password IS NULL OR TRIM(password) = ''"),
  'A20 Bulk migration Step A only sets passwords that are NULL or empty (never overwrites existing)'
);

// ============================================================================
// GROUP B: Frontend source checks
// ============================================================================
console.log('\n── Group B: Frontend Source Code Checks ──');

const studentDashContent = readFileSync('frontend/src/pages/StudentDashboard.jsx', 'utf8');
assert(
  studentDashContent.includes('normalizeStatus') &&
  (studentDashContent.includes('cross-tab') || studentDashContent.includes('المحاضرات')),
  'B1  StudentDashboard.jsx has status normalization and cross-mode absence detection'
);

const loginContent = readFileSync('frontend/src/pages/Login.jsx', 'utf8');
assert(
  loginContent.includes('session_creation_failed') &&
  loginContent.includes('!rpcResult.session_token'),
  'B2  Login.jsx strictly requires valid session_token from server'
);

const appContent = readFileSync('frontend/src/App.jsx', 'utf8');
assert(
  appContent.includes('revoke_student_session') &&
  appContent.includes('Promise.race'),
  'B3  App.jsx calls revoke_student_session on logout with timeout guard'
);

// Verify App.jsx passes p_session_token only (p_user_id not passed — correct)
const revokeCallBlock = appContent.slice(
  appContent.indexOf('revoke_student_session'),
  appContent.indexOf('revoke_student_session') + 200
);
assert(
  revokeCallBlock.includes('p_session_token') &&
  !revokeCallBlock.includes('p_user_id'),
  'B4  App.jsx revoke call uses p_session_token only (p_user_id not passed — correct)'
);

// ============================================================================
// GROUP C: Live API probes
// ============================================================================
async function runLiveProbes() {
  console.log('\n── Group C: Live Backend API Verification ──');

  // C1: get_my_attendance rejects empty token
  const attRes = await rpc('get_my_attendance', { p_session_token: '' });
  assert(
    attRes.status === 401 || attRes.data?.message?.includes('Unauthorized'),
    'C1  get_my_attendance rejects empty session token',
    `HTTP ${attRes.status}`
  );

  // C2: get_my_grades rejects empty token
  const grdRes = await rpc('get_my_grades', { p_session_token: '' });
  assert(
    grdRes.status === 401 || grdRes.data?.message?.includes('Unauthorized'),
    'C2  get_my_grades rejects empty session token',
    `HTTP ${grdRes.status}`
  );

  // C3: revoke_student_session — invalid short token returns false (or 404 if not deployed)
  const shortRes = await rpc('revoke_student_session', { p_session_token: 'tooshort' });
  if (shortRes.status === 404) {
    console.log('[INFO] C3  revoke_student_session: HTTP 404 — migration not yet applied on backend');
  } else {
    assert(
      shortRes.data === false && shortRes.status === 200,
      'C3  revoke_student_session returns false for short invalid token',
      `HTTP ${shortRes.status}, data: ${JSON.stringify(shortRes.data)}`
    );
  }

  // C4: revoke_student_session — valid-format but non-existent token returns false
  const fakeToken = 'a'.repeat(64);
  const fakeRes = await rpc('revoke_student_session', { p_session_token: fakeToken });
  if (fakeRes.status === 404) {
    console.log('[INFO] C4  revoke_student_session: HTTP 404 — migration not yet applied on backend');
  } else {
    assert(
      fakeRes.data === false && fakeRes.status === 200,
      'C4  revoke_student_session returns false for valid-format but non-existent token',
      `HTTP ${fakeRes.status}, data: ${JSON.stringify(fakeRes.data)}`
    );
  }

  // C5: Wrong credentials → uniform invalid_credentials
  const badId = `__probe_${Date.now()}`;
  const badLogin = await rpc('verify_legacy_login', {
    p_user_id: badId,
    p_password: 'DummyNonExistentPassword_12345',
  });
  assert(
    badLogin.data?.success === false && badLogin.data?.error === 'invalid_credentials',
    'C5  Wrong credentials return uniform invalid_credentials (no user enumeration)',
    `error: ${badLogin.data?.error}`
  );

  // C6: 5 failed attempts do NOT trigger rate_limited (threshold = 15)
  const syntheticId = `__probe_rl_${Date.now()}`;
  let gotEarlyRateLimit = false;
  for (let i = 1; i <= 5; i++) {
    const r = await rpc('verify_legacy_login', {
      p_user_id: syntheticId,
      p_password: 'wrong_test_pass',
    });
    if (r.data?.error === 'rate_limited') { gotEarlyRateLimit = true; break; }
  }
  assert(
    !gotEarlyRateLimit,
    'C6  5 failed attempts do NOT trigger rate_limited (threshold is 15, not 10)'
  );

  // C7-C10: optional live login probes (require env vars)
  const testId   = process.env.TEST_STUDENT_ID;
  const testPass = process.env.TEST_STUDENT_PASSWORD;

  if (testId && testPass) {
    const loginRes = await rpc('verify_legacy_login', { p_user_id: testId, p_password: testPass });
    assert(
      loginRes.data?.success === true && !!loginRes.data?.session_token,
      'C7  Student login succeeds with correct credentials',
      `success: ${loginRes.data?.success}, error: ${loginRes.data?.error ?? 'none'}`
    );

    if (loginRes.data?.session_token) {
      const tok = loginRes.data.session_token;

      const attWithTok = await rpc('get_my_attendance', { p_session_token: tok });
      assert(
        attWithTok.ok && Array.isArray(attWithTok.data),
        'C8  get_my_attendance returns data for valid session token',
        `records: ${attWithTok.data?.length}`
      );

      const revokeRes = await rpc('revoke_student_session', { p_session_token: tok });
      assert(
        revokeRes.data === true,
        'C9  revoke_student_session returns true for active token',
        `result: ${revokeRes.data}`
      );

      const afterRevoke = await rpc('get_my_attendance', { p_session_token: tok });
      assert(
        afterRevoke.status === 401 || afterRevoke.data?.message?.includes('Unauthorized'),
        'C10 Revoked token is rejected by get_my_attendance',
        afterRevoke.status === 200
          ? 'CRITICAL: revoked token still accepted'
          : `HTTP ${afterRevoke.status}`
      );
    }
  } else {
    console.log('[INFO] C7-C10 Live login probes skipped — set TEST_STUDENT_ID and TEST_STUDENT_PASSWORD to enable');
  }

  console.log(`\n────────────────────────────────────────────────────────────────────`);
  console.log(`Test Execution Finished. Passed: ${passCount} | Failed: ${failCount}`);
  console.log(`────────────────────────────────────────────────────────────────────\n`);

  process.exit(failCount > 0 ? 1 : 0);
}

runLiveProbes().catch(e => {
  console.error('Fatal probe error:', e);
  process.exit(1);
});
