/**
 * GRADELY SECURITY REMEDIATION — Repeatable Test Suite
 * File: supabase/tests/security_remediation.test.mjs
 *
 * Run with: node supabase/tests/security_remediation.test.mjs
 *
 * REQUIREMENTS:
 *   - Node.js >= 18 (native fetch available)
 *   - @supabase/supabase-js installed in frontend: cd frontend && npm install
 *   - Environment variables set (see CONFIG section below)
 *   - This test uses ONLY real API calls — no mock libraries.
 *   - Never prints real student passwords. Test accounts are identified by
 *     placeholder references only.
 *
 * STAGING vs PRODUCTION:
 *   All tests marked [STAGING-ONLY] should be run against a staging/preview
 *   branch first. Tests marked [SAFE-PROD] are read-only probes.
 *
 * CONSTRAINTS:
 *   - No destructive operations on real student accounts.
 *   - Synthetic test accounts (test_student_A, test_student_B) used where possible.
 *   - Test credentials are loaded from environment variables — never hardcoded.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ==============================================================================
// CONFIG — load from environment (never hardcode credentials)
// ==============================================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdyexsaqnlremprfmph.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || (existsSync(resolve(__dirname, '../../frontend/src/supabaseClient.js'))
      ? (() => {
          const src = readFileSync(resolve(__dirname, '../../frontend/src/supabaseClient.js'), 'utf8');
          const m = src.match(/supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);
          return m ? m[1] : null;
        })()
      : null);

// Test account credentials loaded from environment (never hardcoded)
// Set these before running:
//   export TEST_STUDENT_A_ID=<real student ID>
//   export TEST_STUDENT_A_PASS=<real student password>
//   export TEST_STUDENT_B_ID=<different real student ID>
//   export TEST_STUDENT_B_PASS=<real student password>
const TEST_A_ID   = process.env.TEST_STUDENT_A_ID;
const TEST_A_PASS = process.env.TEST_STUDENT_A_PASS;
const TEST_B_ID   = process.env.TEST_STUDENT_B_ID;
const TEST_B_PASS = process.env.TEST_STUDENT_B_PASS;

// ==============================================================================
// TEST HARNESS
// ==============================================================================
let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    results.push({ status: 'PASS', label, detail });
    console.log(`  ✅ PASS  ${label}`);
  } else {
    failed++;
    results.push({ status: 'FAIL', label, detail });
    console.error(`  ❌ FAIL  ${label}${detail ? '\n          ' + detail : ''}`);
  }
}

function skip(label, reason) {
  skipped++;
  results.push({ status: 'SKIP', label, reason });
  console.log(`  ⏭️  SKIP  ${label} — ${reason}`);
}

function section(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

// ==============================================================================
// SETUP
// ==============================================================================
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[FATAL] SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log(`\n🔐 Gradely Security Test Suite`);
console.log(`   Supabase URL: ${SUPABASE_URL}`);
console.log(`   Time: ${new Date().toISOString()}`);
console.log(`   Node: ${process.version}`);
if (!TEST_A_ID || !TEST_B_ID) {
  console.warn('\n[WARN] TEST_STUDENT_A_ID / TEST_STUDENT_B_ID not set. Login tests will be skipped.');
}

// ==============================================================================
// TEST 1: Anonymous access to raw tables is blocked
// ==============================================================================
section('TEST GROUP 1 — Anonymous access controls');

async function testAnonTableAccess() {
  // 1a. attendance table must require authentication
  const { error: attErr } = await supabase.from('attendance').select('*').limit(1);
  assert(
    !!attErr,
    'T1.1 Anonymous SELECT on attendance is blocked',
    attErr ? '' : 'UNEXPECTED: returned data without auth'
  );

  // 1b. grades table must require authentication
  const { error: gradeErr } = await supabase.from('grades').select('*').limit(1);
  assert(
    !!gradeErr,
    'T1.2 Anonymous SELECT on grades is blocked',
    gradeErr ? '' : 'UNEXPECTED: returned data without auth'
  );

  // 1c. student_credentials_vault must be completely inaccessible
  const { data: vaultData, error: vaultErr } = await supabase
    .from('student_credentials_vault')
    .select('*')
    .limit(1);
  assert(
    !!vaultErr || (Array.isArray(vaultData) && vaultData.length === 0),
    'T1.3 Anonymous access to student_credentials_vault is blocked',
    vaultErr ? '' : `UNEXPECTED: got ${JSON.stringify(vaultData)}`
  );

  // 1d. student_sessions must be completely inaccessible
  const { data: sessData, error: sessErr } = await supabase
    .from('student_sessions')
    .select('*')
    .limit(1);
  assert(
    !!sessErr || (Array.isArray(sessData) && sessData.length === 0),
    'T1.4 Anonymous access to student_sessions is blocked',
    sessErr ? '' : `UNEXPECTED: got ${JSON.stringify(sessData)}`
  );

  // 1e. users.password column must not be accessible
  const { data: pwData, error: pwErr } = await supabase
    .from('users')
    .select('password')
    .limit(1);
  const gotPassword = !pwErr && Array.isArray(pwData) && pwData.length > 0 && 'password' in pwData[0];
  assert(
    !gotPassword,
    'T1.5 Anonymous SELECT on users.password column is blocked',
    gotPassword ? 'CRITICAL: password column visible to anon' : ''
  );
}

await testAnonTableAccess();

// ==============================================================================
// TEST 2: Anonymous RPC calls blocked
// ==============================================================================
section('TEST GROUP 2 — RPC authorization gates');

async function testRPCGates() {
  // 2a. admin_update_user_password must reject anonymous callers
  const { error: pwRpcErr } = await supabase.rpc('admin_update_user_password', {
    p_user_id: 'anon_test',
    p_new_password: 'shouldfail'
  });
  assert(
    !!pwRpcErr,
    'T2.1 admin_update_user_password rejects anonymous callers',
    pwRpcErr ? '' : 'CRITICAL: RPC executed without auth'
  );

  // 2b. get_my_attendance without valid token must return error
  const { error: attRpcErr } = await supabase.rpc('get_my_attendance', {
    p_session_token: ''
  });
  assert(
    !!attRpcErr,
    'T2.2 get_my_attendance with empty token is rejected',
    attRpcErr ? '' : 'UNEXPECTED: returned data without valid token'
  );

  // 2c. get_my_grades without valid token must return error
  const { error: gradeRpcErr } = await supabase.rpc('get_my_grades', {
    p_session_token: ''
  });
  assert(
    !!gradeRpcErr,
    'T2.3 get_my_grades with empty token is rejected',
    gradeRpcErr ? '' : 'UNEXPECTED: returned data without valid token'
  );

  // 2d. Dropped RPCs return 404 (link_my_auth_id, 2FA functions)
  const droppedFunctions = [
    'link_my_auth_id',
    'get_super_admin_2fa_config',
    'update_super_admin_2fa_config',
    'verify_super_admin_2fa',
  ];
  for (const fn of droppedFunctions) {
    const { error: dropErr } = await supabase.rpc(fn, {});
    const isGone = !!dropErr && (
      dropErr.code === '42883' ||       // function does not exist
      dropErr.message?.includes('404') ||
      dropErr.message?.includes('does not exist') ||
      dropErr.message?.includes('not found')
    );
    assert(
      isGone || !!dropErr,
      `T2.4 Dropped RPC '${fn}' is inaccessible`,
      dropErr ? `(error: ${dropErr.code} — ${dropErr.message})` : 'UNEXPECTED: function is callable'
    );
  }
}

await testRPCGates();

// ==============================================================================
// TEST 3: Student login compatibility
// ==============================================================================
section('TEST GROUP 3 — Student login compatibility');

let tokenA = null;
let tokenB = null;

async function testStudentLogin() {
  if (!TEST_A_ID || !TEST_A_PASS) {
    skip('T3.1 Student A login with printed-card password', 'TEST_STUDENT_A_ID/PASS not set');
    skip('T3.2 Invalid password is rejected for Student A', 'TEST_STUDENT_A_ID/PASS not set');
    skip('T3.3 Student B login with printed-card password', 'TEST_STUDENT_B_ID/PASS not set');
    return;
  }

  // 3a. Valid student A login
  const { data: resultA } = await supabase.rpc('verify_legacy_login', {
    p_user_id: TEST_A_ID,
    p_password: TEST_A_PASS
  });
  const loginAOk = resultA && resultA.success === true && resultA.session_token;
  assert(loginAOk, 'T3.1 Student A logs in with printed-card password');
  if (loginAOk) {
    tokenA = resultA.session_token;
    // Security: do NOT log the token itself
    console.log(`         (session token obtained for Student A — length: ${tokenA.length} chars)`);
  }

  // 3b. Wrong password must be rejected
  const { data: resultABad } = await supabase.rpc('verify_legacy_login', {
    p_user_id: TEST_A_ID,
    p_password: 'DEFINITELY_WRONG_PASSWORD_!!!'
  });
  assert(
    resultABad && resultABad.success === false,
    'T3.2 Invalid password is rejected for Student A (not a false positive)',
    resultABad?.error || ''
  );

  // 3c. Student B login
  if (!TEST_B_ID || !TEST_B_PASS) {
    skip('T3.3 Student B login', 'TEST_STUDENT_B_ID/PASS not set');
    return;
  }
  const { data: resultB } = await supabase.rpc('verify_legacy_login', {
    p_user_id: TEST_B_ID,
    p_password: TEST_B_PASS
  });
  const loginBOk = resultB && resultB.success === true && resultB.session_token;
  assert(loginBOk, 'T3.3 Student B logs in with printed-card password');
  if (loginBOk) {
    tokenB = resultB.session_token;
  }
}

await testStudentLogin();

// ==============================================================================
// TEST 4: Student data isolation (one student cannot see another's data)
// ==============================================================================
section('TEST GROUP 4 — Student data isolation');

async function testDataIsolation() {
  if (!tokenA) {
    skip('T4.1 Student A can retrieve own attendance', 'Student A not logged in');
    skip('T4.2 Student A attendance data scoped to A only', 'Student A not logged in');
    skip('T4.3 Student A cannot retrieve Student B data using A token', 'missing tokens');
    return;
  }

  // 4a. Student A can retrieve own attendance
  const { data: attA, error: attAErr } = await supabase.rpc('get_my_attendance', {
    p_session_token: tokenA
  });
  assert(
    !attAErr && Array.isArray(attA),
    'T4.1 Student A can retrieve own attendance with valid session token',
    attAErr ? attAErr.message : `(${attA?.length ?? 0} records)`
  );

  // 4b. All attendance records returned belong to Student A
  if (Array.isArray(attA) && attA.length > 0 && TEST_A_ID) {
    const allMine = attA.every(r => !r.student_id || r.student_id === TEST_A_ID);
    assert(
      allMine,
      'T4.2 All attendance records returned belong to Student A (data isolation)',
      allMine ? '' : 'CRITICAL: records from another student returned'
    );
  } else {
    skip('T4.2 Attendance data isolation check', 'No attendance records found for Student A');
  }

  // 4c. Student A's token should NOT return Student B's data
  //     (get_my_attendance uses the token to look up the student_id — it's server-side)
  //     The only way to test cross-student access is to compare results from two tokens.
  if (!tokenB) {
    skip('T4.3 Student B data inaccessible via Student A token', 'Student B token not available');
    return;
  }

  const { data: attB } = await supabase.rpc('get_my_attendance', {
    p_session_token: tokenB
  });

  if (Array.isArray(attA) && Array.isArray(attB) && TEST_A_ID && TEST_B_ID) {
    const studentIdsInA = new Set((attA || []).map(r => r.student_id).filter(Boolean));
    const studentIdsInB = new Set((attB || []).map(r => r.student_id).filter(Boolean));
    const overlap = [...studentIdsInA].filter(id => studentIdsInB.has(id));
    // Overlap is only allowed if A and B happen to be the same student (should not be in test setup)
    assert(
      overlap.length === 0 || (overlap.length === 1 && overlap[0] === TEST_A_ID && TEST_A_ID === TEST_B_ID),
      'T4.3 Student A and Student B have no overlapping records (cross-student isolation confirmed)',
      overlap.length > 0 ? `CRITICAL overlap: ${overlap.join(', ')}` : ''
    );
  } else {
    skip('T4.3 Cross-student isolation', 'Missing attendance data for one or both students');
  }
}

await testDataIsolation();

// ==============================================================================
// TEST 5: Server-side session revocation
// ==============================================================================
section('TEST GROUP 5 — Server-side session revocation');

async function testSessionRevocation() {
  if (!TEST_A_ID || !TEST_A_PASS) {
    skip('T5.1 Login to get fresh token for revocation test', 'TEST_STUDENT_A_ID/PASS not set');
    skip('T5.2 Token valid before revocation', 'no token');
    skip('T5.3 revoke_student_session returns true', 'no token');
    skip('T5.4 Revoked token rejected by get_my_attendance', 'no token');
    skip('T5.5 Revoked token rejected by get_my_grades', 'no token');
    skip('T5.6 Revoking already-revoked token returns false', 'no token');
    return;
  }

  // Get a fresh token specifically for this revocation test
  const { data: freshLogin } = await supabase.rpc('verify_legacy_login', {
    p_user_id: TEST_A_ID,
    p_password: TEST_A_PASS
  });
  const freshToken = freshLogin?.session_token;
  assert(
    !!freshToken,
    'T5.1 Obtained fresh token for revocation test'
  );
  if (!freshToken) return;

  // 5b. Confirm token works BEFORE revocation
  const { data: preBefore, error: preErr } = await supabase.rpc('get_my_attendance', {
    p_session_token: freshToken
  });
  assert(
    !preErr && Array.isArray(preBefore),
    'T5.2 Fresh token is valid and accepted by get_my_attendance before revocation',
    preErr ? preErr.message : `(${preBefore?.length ?? 0} records)`
  );

  // 5c. Revoke the session
  const { data: revokeResult, error: revokeErr } = await supabase.rpc('revoke_student_session', {
    p_session_token: freshToken
  });
  assert(
    !revokeErr && revokeResult === true,
    'T5.3 revoke_student_session returns true for valid token',
    revokeErr ? revokeErr.message : `(result: ${revokeResult})`
  );

  // 5d. Attendance must now reject the revoked token
  const { error: postAttErr } = await supabase.rpc('get_my_attendance', {
    p_session_token: freshToken
  });
  assert(
    !!postAttErr,
    'T5.4 Revoked token is rejected by get_my_attendance',
    postAttErr ? '' : 'CRITICAL: revoked token still accepted!'
  );

  // 5e. Grades must also reject the revoked token
  const { error: postGradeErr } = await supabase.rpc('get_my_grades', {
    p_session_token: freshToken
  });
  assert(
    !!postGradeErr,
    'T5.5 Revoked token is rejected by get_my_grades',
    postGradeErr ? '' : 'CRITICAL: revoked token still accepted for grades!'
  );

  // 5f. Revoking the same token again must return false (already deleted)
  const { data: revokeAgain, error: revokeAgainErr } = await supabase.rpc('revoke_student_session', {
    p_session_token: freshToken
  });
  assert(
    !revokeAgainErr && revokeAgain === false,
    'T5.6 Revoking an already-revoked token returns false (idempotent)',
    revokeAgainErr ? revokeAgainErr.message : `(result: ${revokeAgain})`
  );
}

await testSessionRevocation();

// ==============================================================================
// TEST 6: Rate limiting — lockout does NOT trigger before threshold
// ==============================================================================
section('TEST GROUP 6 — Rate limiting (DoS protection)');

async function testRateLimiting() {
  // Use a clearly invalid user ID that no real student would have
  // so we do not touch real account lockout state
  const SYNTHETIC_ID = '__gradely_test_ratelimit_synthetic__';
  const BAD_PASS = 'wrong_pass_test_only';

  // Submit 5 failed attempts (below the threshold of 15)
  // These should all fail with 'invalid_credentials', NOT 'rate_limited'
  let allReturnedInvalidCredentials = true;
  let gotRateLimitedEarly = false;

  for (let i = 1; i <= 5; i++) {
    const { data: res } = await supabase.rpc('verify_legacy_login', {
      p_user_id: SYNTHETIC_ID,
      p_password: BAD_PASS
    });
    if (res?.error === 'rate_limited') {
      gotRateLimitedEarly = true;
      break;
    }
    if (res?.error !== 'invalid_credentials') {
      allReturnedInvalidCredentials = false;
    }
  }

  assert(
    !gotRateLimitedEarly,
    'T6.1 Fewer than 15 bad attempts do not trigger rate_limited error (protects against 10-attempt DoS)',
    gotRateLimitedEarly ? 'FAIL: lockout triggered at <= 5 attempts' : ''
  );

  assert(
    allReturnedInvalidCredentials,
    'T6.2 Failed attempts return uniform "invalid_credentials" error (no user enumeration)',
    allReturnedInvalidCredentials ? '' : 'Some attempts returned a different error code'
  );

  // Note: We intentionally do NOT test the full lockout path (15 attempts)
  // against a synthetic ID in production because we would leave a stale lockout
  // record for an ID that does not exist. That record is harmless but untidy.
  // In a staging environment with database access, run:
  //   SELECT * FROM login_attempts WHERE user_id = '__gradely_test_ratelimit_synthetic__';
  //   DELETE FROM login_attempts WHERE user_id = '__gradely_test_ratelimit_synthetic__';
  console.log(`\n  ℹ️  NOTE: Synthetic ID '${SYNTHETIC_ID}' may have a lockout record in login_attempts.`);
  console.log(`         Clean up after testing with: DELETE FROM login_attempts WHERE user_id = '${SYNTHETIC_ID}';`);
}

await testRateLimiting();

// ==============================================================================
// TEST 7: Bcrypt migration health check (no credentials exposed)
// ==============================================================================
section('TEST GROUP 7 — Bcrypt migration health (count-only check via RPC)');

async function testBcryptMigration() {
  // We cannot directly query users.password (column is restricted).
  // Instead we verify that existing student passwords still work — proving
  // bcrypt verify_legacy_login path D is working.
  if (!TEST_A_ID || !TEST_A_PASS) {
    skip('T7.1 Existing student can still login after bcrypt migration', 'TEST_STUDENT_A_ID/PASS not set');
    skip('T7.2 Bcrypt path verified by successful login', 'no credentials');
    return;
  }

  // The test account must still be able to login after migration.
  // If users.password was hashed by the trigger, verify_legacy_login path A1
  // (bcrypt check) will handle this.
  const { data: afterMigration } = await supabase.rpc('verify_legacy_login', {
    p_user_id: TEST_A_ID,
    p_password: TEST_A_PASS
  });
  assert(
    afterMigration && afterMigration.success === true && afterMigration.session_token,
    'T7.1 Existing student can still login after bcrypt migration (password unchanged from student perspective)',
    afterMigration ? JSON.stringify({ success: afterMigration.success, error: afterMigration.error }) : 'null result'
  );

  // Revoke the session created in this test to keep DB clean
  if (afterMigration?.session_token) {
    await supabase.rpc('revoke_student_session', {
      p_session_token: afterMigration.session_token
    }).catch(() => {});
    console.log('         (test session revoked after migration test)');
  }

  // 7b. Wrong password must still be rejected after bcrypt migration
  const { data: wrongAfterMigration } = await supabase.rpc('verify_legacy_login', {
    p_user_id: TEST_A_ID,
    p_password: 'NOT_THE_REAL_PASSWORD_AT_ALL'
  });
  assert(
    wrongAfterMigration && wrongAfterMigration.success === false,
    'T7.2 Wrong password correctly rejected after bcrypt migration',
    wrongAfterMigration?.error || ''
  );
}

await testBcryptMigration();

// ==============================================================================
// SUMMARY
// ==============================================================================
section('SUMMARY');
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Total:   ${passed + failed + skipped}`);

if (failed > 0) {
  console.log(`\n  ❌ FAILURES DETECTED — DO NOT DEPLOY TO PRODUCTION`);
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.error(`     → ${r.label}`);
    if (r.detail) console.error(`       ${r.detail}`);
  });
  process.exit(1);
} else if (skipped > 0) {
  console.log(`\n  ⚠️  Some tests were skipped due to missing test credentials.`);
  console.log(`     Set TEST_STUDENT_A_ID, TEST_STUDENT_A_PASS, TEST_STUDENT_B_ID,`);
  console.log(`     TEST_STUDENT_B_PASS and re-run for full coverage.`);
  process.exit(0);
} else {
  console.log(`\n  ✅ ALL TESTS PASSED`);
  process.exit(0);
}
