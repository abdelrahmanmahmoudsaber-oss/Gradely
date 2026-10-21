# Gradely — Final Security Sign-Off & Verification Report
**Evidence Gaps, High-Risk Follow-Up, and Comprehensive Audit**

- **Target Web Application:** `https://gradely-two.vercel.app`
- **Backend Infrastructure:** Supabase PostgreSQL Project `bbdyexsaqnlremprfmph`
- **Evaluation Date:** 2026-10-17
- **Classification:** Strictly Confidential — Engineering & Security Sign-Off
- **Auditor:** Antigravity Advanced Agentic Security Team

---

## 1. Executive Summary & Assessment Methodology

Following the implementation of emergency security migrations on 2026-10-16, an independent, rigorous follow-up assessment was conducted. Rather than accepting HTTP response codes at face value or relying on code review assumptions, testing executed multi-role live API probes, dual-student cross-token isolation experiments, token mutation tests, and schema-level verification.

### Key Conclusions:
1. **Critical Inbound Attack Surfaces (ISSUE-17, ISSUE-18, ISSUE-6, ISSUE-14):** **VERIFIED CLOSED**.
   - Anonymous password modifications via `admin_update_user_password` are rejected at the PostgREST gateway (`HTTP 401 / 42501`).
   - The previously exploitable 2FA RPCs (`get_super_admin_2fa_config`, `update_super_admin_2fa_config`, `verify_super_admin_2fa`) and the backing `security_settings` table have been completely dropped from the API schema (`HTTP 404`).
   - The `link_my_auth_id` RPC has been completely dropped from the API schema (`HTTP 404`).
   - An engine-level PostgreSQL `BEFORE INSERT OR UPDATE` trigger (`trg_protect_user_role`) strictly prevents any non-super-admin from elevating roles, altering admin accounts, or rebinding `auth_id`.
   - Direct anonymous scraping of `attendance`, `grades`, and `subjects.enrolled_students` is blocked (`HTTP 401 / 42501`).
2. **Student-to-Student Data Isolation:** **EMPIRICALLY PROVEN**.
   - Two distinct valid student sessions were generated live.
   - Calling `get_my_attendance(token)` returned exclusively the attendance records matching each student's authenticated ID. Overlap between student datasets was exactly **0 records**.
   - Forged, truncated, altered, and SQL-injected tokens fail closed with `HTTP 401 Unauthorized`.
3. **Identified Security Gaps & Pre-Sign-Off Blockers:**
   - **Super-Admin Single-Factor Vulnerability:** Removing the vulnerable custom PIN/RPCs removed the live leak, but left the Super-Admin account protected solely by a single factor (email + password). Database triggers enforce authorization, but *cannot replace Multi-Factor Authentication (MFA)*.
   - **Cleartext Password Storage in `users.password`:** The 335 student passwords from printed cards are currently stored in plaintext. While direct REST selection is blocked via column privileges, database-at-rest exposure remains.
   - **Missing Server-Side Session Revocation on Logout:** Logout clears `localStorage` client-side, but does not invalidate the session token in `student_sessions`, leaving it valid for the 30-day window.
   - **Account Lockout Denial-of-Service (DoS):** Rate limiting in `verify_legacy_login` is scoped exclusively to `user_id` without IP binding. A malicious caller can deliberately lock out a legitimate student for 15 minutes by submitting 10 incorrect passwords.

---

## 2. Comprehensive Vulnerability & Property Status Matrix

| ID / Property | Classification | Previous Status | Current Validated Status | Primary Technical Boundary | Verification Evidence |
|---|---|---|---|---|---|
| **ISSUE-17** | Unauth Password Write | Critical | **FIXED** | Privilege Revoke + In-body `auth.uid() IS NULL` gate | `POST /rpc/admin_update_user_password` (anon) -> `401: 42501 permission denied` |
| **ISSUE-18** | 2FA Secret Leak & PIN Rewrite | High | **FIXED (SURFACE PURGED)** | Functions and `security_settings` table dropped | `POST /rpc/get_super_admin_2fa_config` -> `404: PGRST202`<br>`GET /rest/v1/security_settings` -> `404: PGRST205` |
| **ISSUE-6** | Self-Binding Account Takeover | High | **FIXED** | `link_my_auth_id` dropped + DB Trigger `trg_protect_user_role` | `POST /rpc/link_my_auth_id` -> `404: PGRST202`<br>Client auto-link code removed |
| **ISSUE-14** | Anonymous Data Harvesting | High | **FIXED** | Table RLS + Column Revoke + Tokenized RPCs | `/attendance` -> `401`<br>`/subjects?select=enrolled_students` -> `401` |
| **ISSUE-16** | Plaintext Password API Exposure | Medium | **PARTIALLY FIXED** | Column-level SELECT revoked from anon/authenticated | REST `users?select=password` blocked (`401`); underlying DB rows still cleartext |
| **Super-Admin MFA** | Authentication Assurance | High | **OPEN GAP** | Single-factor Supabase Auth; no native MFA enrolled | Inspection confirmed no native MFA enforcement on super-admin |
| **Session Revocation** | Session Management | Medium | **OPEN GAP** | Client-side `removeItem` only; no DB delete | Probe confirmed `revoke_student_session` does not exist (`404`); tokens valid 30d |
| **Lockout DoS** | Abuse Resistance / Availability | Medium | **OPEN GAP** | `login_attempts` tracks only `user_id`, no IP binding | Verified: 10 failed attempts locks user account globally for 15 minutes |
| **ISSUE-5** | Exposed Webhooks & Emails | Medium | **FIXED** | Database cleaned; frontend uses dynamic user configs | 22 subjects scanned in DB -> `0 leaks`<br>Frontend code -> `0 hardcoded webhooks` |
| **ISSUE-7** | User Profile IDOR | Low | **FIXED** | RLS profile isolation | Anonymous access denied (`401`); self-only read |
| **ISSUE-13** | Open Public Signup | High | **FIXED** | Instance signup disabled in Supabase Auth | `POST /auth/v1/signup` -> `422: signup_disabled` |
| **ISSUE-15** | Brute-force Login Oracle | Medium | **ENFORCED** | Lockout triggers on attempt #10 | Empirically verified lockout activation |

---

## 3. Deep-Dive Investigation of Evidence Gaps

### 3.1 Super-Admin Authentication After Removing 2FA
- **Current Authentication Flow:**
  The Super Admin logs in via `supabase.auth.signInWithPassword({ email, password })`.
  This produces a standard Supabase Auth JWT.
- **Authorization Enforcement (`trg_protect_user_role`):**
  When an administrative action is attempted (e.g. creating an admin, updating roles, changing `auth_id`), the database trigger executes:
  ```sql
  IF (TG_OP = 'INSERT' AND NEW.role IN ('admin', 'super_admin')) OR 
     (TG_OP = 'UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.auth_id IS DISTINCT FROM OLD.auth_id)) THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only Super Admin can modify administrative roles or bind auth_id' USING errcode = '42501';
    END IF;
  END IF;
  ```
  `public.is_super_admin()` checks:
  1. `auth.uid() IS NOT NULL`
  2. A row exists in `public.users` where `role = 'super_admin'` and (`auth_id = auth.uid()` OR verified email match).
- **The Security Gap:**
  A database trigger enforces **authorization** (what an identity can do), but does **not** provide **authentication strength** (verifying that the person presenting the credentials is the actual owner).
  Removing the vulnerable custom PIN/RPCs closed the backdoor, but left the Super-Admin account relying on a single factor (password). If the Super-Admin's password is phished, reused, or compromised, an attacker gains full super-admin access.
- **Recommended Safe Fix:**
  Enable **Native Supabase Auth MFA (TOTP)**.
  Supabase provides built-in RFC 6238 TOTP via `supabase.auth.mfa.enroll({ factorType: 'totp' })` and `supabase.auth.mfa.challengeAndVerify()`. This is stored in Supabase's hardened internal auth schema, involves zero custom database RPCs, stores zero secrets in `public`, and enforces true cryptographic two-factor authentication.

---

### 3.2 Password Storage & Legacy Authentication Architecture
- **Storage Format:**
  Inspection of database migrations (`20261015_apply_pdf_printed_passwords.sql`) and `verify_legacy_login` confirms that the 335 student passwords distributed on printed physical cards are stored in **cleartext** in `public.users.password` (e.g. strings like `#eu7R7kM`, `fRnp874*`).
- **Access Control Boundary:**
  `REVOKE SELECT ON TABLE public.users FROM anon, authenticated, public;`
  `GRANT SELECT (id, user_id, name, role, year_level, section, assigned_subjects, created_at, last_sign_in_at) ON public.users TO anon;`
  Any attempt to query `password` via REST (`/rest/v1/users?select=password`) is rejected with `HTTP 401 / 42501 permission denied`.
- **SQL Injection Resistance:**
  `verify_legacy_login` is a PL/pgSQL function using parameterized static queries (`WHERE user_id = v_clean_id`). Parameter concatenation (`EXECUTE '...' || ...`) is not used. SQL injection cannot alter credential evaluation.
- **Why Storing Plaintext is Still a Finding (CWE-256):**
  While the external REST interface is blocked, any privileged backend compromise, SQL Editor session, database dump, or service-role leak exposes all 335 passwords.
- **Non-Breaking Bcrypt Migration Plan (Approved Blueprint):**
  1. `verify_legacy_login` *already contains* bcrypt matching logic:
     ```sql
     IF NOT v_pass_valid AND v_user.password LIKE '$2%' THEN
       IF extensions.crypt(p_password, v_user.password) = v_user.password THEN
         v_pass_valid := true;
       END IF;
     END IF;
     ```
  2. A single migration script can execute:
     ```sql
     UPDATE public.users
     SET password = extensions.crypt(password, extensions.gen_salt('bf', 10))
     WHERE password IS NOT NULL AND password NOT LIKE '$2%';
     DROP TABLE IF EXISTS public.student_credentials_vault CASCADE;
     ```
  3. **Zero Impact on Students:** Students will continue typing the exact same printed card passwords. `extensions.crypt()` will verify them against the stored bcrypt hash. The cleartext passwords will be permanently wiped from disk.

---

### 3.3 Session Token Lifecycle & Cross-Student Isolation
- **Token Generation:**
  `v_session_token := encode(extensions.gen_random_bytes(32), 'hex');`
  Generates 256 bits of cryptographic randomness via OpenSSL/PostgreSQL crypto extensions (64 hex characters). Entropy is $2^{256}$, preventing brute-force token guessing.
- **Empirical Isolation Test Evidence:**
  Two separate student accounts were logged in concurrently:
  - Account 1 (`2602854`): Issued 64-char Token A. Retrieved 9 records. 100% matched `student_id = 2602854`.
  - Account 2 (`2601387`): Issued 64-char Token B. Retrieved 9 records. 100% matched `student_id = 2601387`.
  - **Cross-Query Isolation:** Dataset intersection between Token A and Token B was **0 records**.
  - `get_my_attendance` and `get_my_grades` do not accept any user ID argument; identity is derived strictly from `student_sessions.user_id`.
- **Negative Token Testing:**
  - Truncated token (16 chars): `HTTP 401 Unauthorized`.
  - Modified byte token: `HTTP 401 Unauthorized`.
  - Forged 64-char random token: `HTTP 401 Unauthorized`.
  - SQL injection payload (`' OR '1'='1`): `HTTP 401 Unauthorized`.
  - Empty token (`""`): `HTTP 401 Unauthorized`.
- **Identified Session Lifecycle Gaps:**
  1. **No Server-Side Revocation on Logout:**
     In `App.jsx`, logging out executes `localStorage.removeItem('gradely_session_token')`. The session token is never deleted from `public.student_sessions`. If an attacker stole the token prior to logout, it remains valid until the 30-day expiration.
  2. **30-Day Static Lifetime:**
     A 30-day fixed lifetime without sliding expiration is excessive for a shared computer environment (e.g. university computer labs).
  3. **Password Change Behavior:**
     Changing a password does not invalidate previously issued tokens in `student_sessions`.

---

### 3.4 Rate Limiting & Account Lockout Denial-of-Service Analysis
- **Implementation in `verify_legacy_login`:**
  Tracks failed attempts in table `public.login_attempts (user_id text, attempts int, locked_until timestamptz)`.
  Lockout triggers after 10 failed attempts for a duration of 15 minutes (`now() + interval '15 minutes'`).
- **Empirical Test:**
  Sent 10 consecutive failed logins to a probe user identifier. On attempt #10, the response changed from `invalid_credentials` to:
  ```json
  {"error": "rate_limited", "message": "تم تجاوز عدد محاولات الدخول الخاطئة المسموحة. يرجى الانتظار 15 دقيقة.", "success": false}
  ```
- **Identified Gap (Account Lockout DoS):**
  Because tracking is strictly keyed by `user_id` without client IP awareness:
  - An attacker knowing a student's public academic ID can deliberately trigger the 15-minute lockout repeatedly from an external network.
  - This prevents the legitimate student from logging in on exam or registration days.
- **User Enumeration Nuance:**
  `verify_legacy_login` increments `login_attempts` even if the user does not exist in `users`. However, if an attacker repeatedly probes an ID and receives `rate_limited`, it confirms that the lockout logic is tracking that ID.

---

### 3.5 Real Authorization Coverage & Boundary Verification

| Caller Context | Tested Actions | Result / Boundary | Status |
|---|---|---|---|
| **Anonymous (`anon`)** | Direct REST on `users`, `attendance`, `grades`, `student_sessions`<br>Execute `admin_update_user_password`<br>Execute 2FA RPCs / `security_settings` | **BLOCKED (401 / 404)**<br>Tables protected by RLS and revoked column grants.<br>Dangerous RPCs removed or require authentication. | **VERIFIED** |
| **Student (Legacy Token)** | Login with card credentials<br>Retrieve own attendance & grades<br>Attempt cross-student attendance retrieval<br>Direct REST queries on core tables | **ALLOWED FOR SELF / BLOCKED FOR OTHERS**<br>Self-records retrieved seamlessly.<br>Cross-student records return 0 overlap.<br>Direct REST queries blocked (`401`). | **VERIFIED** |
| **Student (Altered State)** | Attempt to update `users.role` to admin<br>Attempt to call `admin_update_user_password` | **BLOCKED (401 / 42501)**<br>Blocked by trigger `trg_protect_user_role` and function permissions. | **VERIFIED** |
| **Teaching Assistant (TA)** | View assigned sections<br>Record attendance & grades for assigned section<br>Attempt to modify admin roles | **INFERRED / PARTIALLY UNVERIFIED**<br>Trigger prevents TAs from creating admins.<br>Live test with active TA credentials was not performed in this session. | **INCONCLUSIVE (NEEDS TA TEST)** |
| **Ordinary Admin** | Call `admin_update_user_password` on Super Admin<br>Call `admin_update_user_password` on student | **SUPER ADMIN BLOCKED / STUDENT ALLOWED**<br>`admin_update_user_password` explicitly blocks changing super_admin password unless caller is super_admin. | **VERIFIED BY CODE REVIEW** |
| **Super Admin** | Full management, admin creation | **ALLOWED VIA TRIGGER & POLICIES**<br>Must be protected by native MFA to prevent credential compromise. | **VERIFIED BY CODE REVIEW** |

---

## 4. Prioritized Action Plan Before Final Production Sign-Off

### Phase A: Critical Security Improvements (Recommended Before Full Sign-Off)
1. **Enable Native Supabase Auth MFA on Super-Admin:**
   Configure native TOTP MFA in the Supabase Dashboard and frontend for the Super-Admin account. This eliminates the single-factor risk without introducing vulnerable custom RPCs.
2. **Server-Side Token Revocation RPC:**
   Create a secure function `public.revoke_student_session(p_session_token text)`:
   ```sql
   CREATE OR REPLACE FUNCTION public.revoke_student_session(p_session_token text)
   RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   BEGIN
     DELETE FROM public.student_sessions WHERE token = TRIM(p_session_token);
     RETURN true;
   END; $$;
   GRANT EXECUTE ON FUNCTION public.revoke_student_session(text) TO anon, authenticated;
   ```
   Call this function in `handleLogout` in `App.jsx` to immediately invalidate sessions on the server upon logout.
3. **Transparent Bcrypt Migration of Student Passwords:**
   Execute the migration to hash all plaintext passwords in `public.users.password` with `extensions.crypt()` and drop `student_credentials_vault`. This preserves 100% login compatibility while protecting credentials at rest.

### Phase B: Defense-in-Depth & Operational Hardening (Post-Sign-Off Maintenance)
1. **Mitigate Lockout DoS:**
   Update `login_attempts` or leverage Supabase Edge rate limiting to incorporate IP-based throttling, preventing malicious third parties from locking out victim student IDs.
2. **Reduce Token Lifetime & Implement Expiration Cleanup:**
   Reduce student session duration from 30 days to 24–48 hours, and deploy a scheduled cron job (via `pg_cron` or Supabase Edge Function) to delete rows where `expires_at < now()`.
3. **Conduct Granular TA Workflow Regression:**
   Perform an end-to-end operational walkthrough using dedicated Teaching Assistant test credentials to verify section-level boundaries.

---

## 5. Formal Verdict

- **Critical Inbound Vulnerabilities (Remote Admin Takeover, Anonymous Credential Reset, Unauthenticated Data Dumps):** **RESOLVED**.
- **Student Authentication & Data Isolation:** **FUNCTIONAL AND ISOLATED**.
- **Security Posture:** **HARDENED AND SECURE AGAINST PREVIOUS CRITICAL VECTORS**, subject to completing native Super-Admin MFA and password hashing migration for full defense-in-depth compliance.
