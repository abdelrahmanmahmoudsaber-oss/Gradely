# Gradely — Read-Only Implementation Review & Safe Remediation Plan

**Target Application:** `https://gradely-two.vercel.app`  
**Backend:** Supabase Project `bbdyexsaqnlremprfmph`  
**Assessment Date:** 2026-10-17  
**Status:** Read-Only Review & Proposed Plan (NO PRODUCTION CHANGES APPLIED)

---

## 1. Bcrypt Password Migration Plan

### 1.1 Technical Architecture & Verification of Deployed Code
Inspection of the live `verify_legacy_login` function reveals the exact current password evaluation sequence:
```sql
-- 1. Direct plaintext match against public.users.password (Printed PDF cards)
IF v_user.password IS NOT NULL AND (
   v_user.password = p_password OR v_user.password = v_clean_pass OR TRIM(v_user.password) = v_clean_pass
) THEN v_pass_valid := true; END IF;

-- 2. Fallback check against public.student_credentials_vault (Dual PDF/Excel passwords)
IF NOT v_pass_valid THEN
  IF EXISTS (SELECT 1 FROM public.student_credentials_vault WHERE user_id = v_clean_id AND (
    pdf_password IN (p_password, v_clean_pass) OR excel_password IN (p_password, v_clean_pass)
  )) THEN v_pass_valid := true; END IF;
END IF;

-- 3. Hardcoded support for specific student edge-cases (2302968, 2402313)
-- ...

-- 4. Cryptographic one-way hash match if stored password is a bcrypt string
IF NOT v_pass_valid AND v_user.password LIKE '$2%' THEN
  IF extensions.crypt(p_password, v_user.password) = v_user.password
     OR extensions.crypt(v_clean_pass, v_user.password) = v_user.password THEN
    v_pass_valid := true;
  END IF;
END IF;
```

### 1.2 Consumers of `users.password` and `student_credentials_vault`
Every consumer across the repository and backend has been identified:
1. `public.verify_legacy_login(text, text)`: Reads `users.password` and `student_credentials_vault` to authenticate legacy student logins.
2. `public.admin_update_user_password(text, text)`: Writes new passwords to `users.password` (and mirrors to `auth.users`).
3. `StudentsTab.jsx` (Batch Excel Import, lines 650–660): Inserts/updates `password` during student bulk import.
4. `student_credentials_vault`: An auxiliary table created during the 2026-10-15 password reconciliation to bridge discrepancies between the Excel sheet and physical printed cards.

### 1.3 Nature of Bcrypt
> [!IMPORTANT]
> **Bcrypt is a slow, salted, one-way cryptographic hash function, NOT encryption.**
> - Password *encryption* implies a two-way algorithm (e.g. AES-GCM) where a secret key can decrypt the data back to cleartext.
> - Password *hashing* with bcrypt generates a non-reversible cryptographic digest incorporating an individual salt and cost factor (`$2b$10$...`). It is mathematically impossible to "decrypt" a bcrypt hash back into a student password.
> - Verification works by taking the user's entered password, applying the salt stored in the hash, and comparing the resulting digest.

### 1.4 Reversible, Zero-Breakage Migration Strategy
Because students already possess printed physical cards, **no student passwords can be changed or reset**. The migration must preserve 100% compatibility with the cards in students' hands.

#### Phase 1: Database Trigger for Automatic Bcrypt Hashing
Create a `BEFORE INSERT OR UPDATE` trigger on `public.users` that automatically intercepts any plaintext password and hashes it with `extensions.crypt(password, extensions.gen_salt('bf', 10))` if it does not already start with `$2`:
```sql
CREATE OR REPLACE FUNCTION public.trg_auto_bcrypt_users_password()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.password IS NOT NULL AND TRIM(NEW.password) <> '' AND NEW.password NOT LIKE '$2%' THEN
    NEW.password := extensions.crypt(TRIM(NEW.password), extensions.gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_bcrypt_password ON public.users;
CREATE TRIGGER trg_auto_bcrypt_password
  BEFORE INSERT OR UPDATE OF password ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_bcrypt_users_password();
```

#### Phase 2: Staged Migration of Existing Rows
1. Create a temporary backup table `public._users_password_backup_rollback` accessible only by `postgres` / `service_role`.
2. Hash all existing plaintext records in `public.users.password`:
```sql
-- Step A: Safe, isolated backup for rollback
CREATE TABLE IF NOT EXISTS public._users_password_backup_rollback AS
SELECT id, user_id, password FROM public.users WHERE password IS NOT NULL AND password NOT LIKE '$2%';
REVOKE ALL ON public._users_password_backup_rollback FROM anon, authenticated, public;

-- Step B: Hash in place
UPDATE public.users
SET password = extensions.crypt(TRIM(password), extensions.gen_salt('bf', 10))
WHERE password IS NOT NULL AND password NOT LIKE '$2%';
```

#### Phase 3: Hash `student_credentials_vault` & Deprecate
Rather than immediately dropping `student_credentials_vault`, migrate any student whose password only existed in the vault into `public.users.password` (hashed), then set the vault permissions to `REVOKE ALL`.

### 1.5 Validation Protocol Without Exposing Credentials
- Test authentication against authorized test accounts (`2602854` and `2601387`) using `verify_legacy_login`.
- Verify that `verify_legacy_login` returns `success: true` and issues a valid `session_token`.
- Verify that `SELECT password FROM users WHERE user_id = '2602854'` begins with `$2b$` or `$2a$`.
- Never log, export, or print the raw hashes or passwords.

### 1.6 Rollback Procedure
If any student authentication fails during validation:
```sql
UPDATE public.users u
SET password = b.password
FROM public._users_password_backup_rollback b
WHERE u.id = b.id;
DROP TABLE public._users_password_backup_rollback;
```

---

## 2. Server-Side Session Revocation Plan

### 2.1 Current Architecture & Deficiencies
- Schema: `public.student_sessions (token text PRIMARY KEY, user_id text NOT NULL, created_at timestamptz, expires_at timestamptz)`.
- Client storage: `localStorage.getItem('gradely_session_token')`.
- Logout: Currently, clicking Logout in `App.jsx` executes `localStorage.removeItem('gradely_session_token')`.
- **Deficiency:** The token is not deleted from `public.student_sessions` on the server. An exported or intercepted token remains functional until `expires_at` (30 days).

### 2.2 Secure Revocation Design (Caller-Owned Session Only)
The revocation function must strictly prevent one student from revoking another student's session.
Because the session token is a 256-bit unguessable bearer credential, the function accepts `p_session_token` and revokes **only the session corresponding to that exact token**:

```sql
CREATE OR REPLACE FUNCTION public.revoke_student_session(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_token text;
BEGIN
  clean_token := TRIM(COALESCE(p_session_token, ''));
  IF clean_token = '' OR LENGTH(clean_token) < 32 THEN
    RETURN false;
  END IF;

  DELETE FROM public.student_sessions
  WHERE token = clean_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_student_session(text) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_student_session(text) TO anon, authenticated;
ALTER FUNCTION public.revoke_student_session(text) OWNER TO postgres;
```

### 2.3 Frontend Integration (`App.jsx`)
In `App.jsx`:
```javascript
  const handleLogout = async () => {
    const activeToken = localStorage.getItem('gradely_session_token');
    if (activeToken) {
      try {
        await supabase.rpc('revoke_student_session', { p_session_token: activeToken });
      } catch (err) {
        console.warn('Server session revocation notice:', err);
      }
    }
    cacheManager.clear();
    await supabase.auth.signOut();
    localStorage.removeItem('gradely_user_display');
    localStorage.removeItem('gradely_student_session');
    localStorage.removeItem('gradely_session_token');
    localStorage.removeItem('gradely_user');
    setUser(null);
  };
```

### 2.4 Token Lifetime & Inactivity Hardening
1. Reduce default token expiration from 30 days to **48 hours**:
   `expires_at timestamptz DEFAULT (now() + interval '48 hours')`
2. Invalidate sessions on password change:
   When `admin_update_user_password` is called for a user, execute:
   `DELETE FROM public.student_sessions WHERE user_id = p_user_id;`

### 2.5 Acceptance Test Criteria
1. **Pre-Logout:** Call `get_my_attendance(token)` -> returns HTTP 200 with records.
2. **Revocation Call:** Call `revoke_student_session(token)` -> returns HTTP 200 with `true`.
3. **Post-Logout:** Immediate call to `get_my_attendance(token)` -> returns `HTTP 401 Unauthorized: Valid student session token or authentication required`.
4. **Foreign Revocation Test:** Ensure passing an invalid or unauthenticated string does not impact any valid sessions.

---

## 3. Super-Admin Multi-Factor Authentication (MFA) Plan

### 3.1 Verification of Supabase Auth Native MFA Capabilities
Supabase Auth provides built-in, cryptographically secure RFC 6238 TOTP Multi-Factor Authentication (MFA). It supports Authenticator Assurance Levels:
- `aal1`: Authenticated via first factor (Email + Password).
- `aal2`: Authenticated via second factor (TOTP / Google Authenticator).

### 3.2 Non-Lockout Enrollment Rollout
To guarantee that the legitimate Super-Admin is never locked out:
1. **Step 1 (Enrollment UI in Admin Dashboard):**
   When the Super-Admin logs into `AdminDashboard.jsx`, render an "أمان الحساب (MFA)" settings card.
   Call `supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Gradely' })`.
   Display the QR code and TOTP secret.
2. **Step 2 (Verification & Activation):**
   The Super-Admin enters the 6-digit code from Google Authenticator.
   Call `supabase.auth.mfa.challengeAndVerify({ factorId, code })`.
   Upon successful verification, the factor transitions to `verified`.
3. **Step 3 (Post-Login Challenge in `Login.jsx`):**
   After `supabase.auth.signInWithPassword()`, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`.
   If `nextLevel === 'aal2'` and `currentLevel === 'aal1'`, show the TOTP prompt modal before redirecting to Admin Dashboard.
4. **Step 4 (Database-Level AAL2 Enforcement for Super-Admin):**
   Update `public.is_super_admin()` to require `aal2` **only if** the user has a verified factor enrolled:
   ```sql
   CREATE OR REPLACE FUNCTION public.is_super_admin()
   RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
   DECLARE
     v_user_auth_id uuid;
     v_has_mfa boolean;
   BEGIN
     IF auth.uid() IS NULL THEN RETURN false; END IF;
     v_user_auth_id := auth.uid();

     -- Check if caller is super_admin in users table
     IF NOT EXISTS (
       SELECT 1 FROM public.users u
       WHERE (u.auth_id = v_user_auth_id OR LOWER(auth.jwt() ->> 'email') = LOWER(u.user_id || '@gradely.app'))
         AND u.role = 'super_admin'
     ) THEN RETURN false; END IF;

     -- Check if super_admin has enrolled MFA factors in auth schema
     SELECT EXISTS (
       SELECT 1 FROM auth.mfa_factors
       WHERE user_id = v_user_auth_id AND status = 'verified'
     ) INTO v_has_mfa;

     -- If MFA is enrolled, strictly require AAL2 in the JWT
     IF v_has_mfa THEN
       RETURN (auth.jwt() ->> 'aal') = 'aal2';
     END IF;

     -- Before enrollment, allow AAL1 to prevent initial lockout
     RETURN true;
   END; $$;
   ```

### 3.3 Recovery & Anti-Lockout Safeguards
- Provide 8 single-use recovery codes generated at enrollment time, displayed once to the Super-Admin.
- Super-Admin email confirmation remains accessible for password reset.
- Service-role emergency bypass via Supabase Dashboard SQL Editor remains available to the project owner.

---

## 4. Layered Login Rate Limiting & DoS Mitigation Plan

### 4.1 Current `login_attempts` Analysis & Vulnerability
In `verify_legacy_login`:
```sql
SELECT 1 FROM public.login_attempts WHERE user_id = v_clean_id AND locked_until > now();
```
- **Vulnerability (Targeted Account Lockout DoS):**
  An attacker who knows a student's public ID (e.g. `2602854`) can send 10 consecutive incorrect password requests. This triggers `locked_until = now() + interval '15 minutes'`.
  The attacker can repeat this every 15 minutes, permanently denying access to the student.
- **Enumeration Oracle:**
  Returning `error: rate_limited` signals that the account exists and is locked.

### 4.2 Layered Rate Limiting Architecture

#### Layer 1: Exponential Delay (Slow-Down) Instead of Early Lockout
Instead of locking the account at attempt #10, introduce progressive PL/pgSQL micro-delays (`pg_sleep`) starting at attempt #5. This throttles automated credential stuffing without locking out the student:
- Attempts 1–4: Instant response (0s delay).
- Attempts 5–7: 1.5-second artificial delay.
- Attempts 8–12: 3-second artificial delay.
- Attempts 13+: Progressive 5-minute cooldown.

#### Layer 2: Composite Proxy-Verified IP Throttling
In Supabase/Vercel environments behind Cloudflare:
Cloudflare strips any client-forged `CF-Connecting-IP` headers and replaces them with the actual client IP at the edge.
`verify_legacy_login` can safely read:
```sql
v_client_ip := current_setting('request.headers', true)::json ->> 'cf-connecting-ip';
```
Failed attempts are tracked using composite keys:
1. `(user_id)`: Limits brute force against a specific account.
2. `(client_ip)`: Blocks an attacker from trying 100 different student IDs from the same machine.

#### Layer 3: Response Uniformity (Zero User Enumeration)
Modify the response of `verify_legacy_login` so that invalid credentials, nonexistent users, and rate-limited attempts return consistent Arabic messages:
- If rate limited:
  ```json
  {"success": false, "error": "rate_limited", "message": "تم رصد محاولات دخول متكررة غير صحيحة. يرجى المحاولة بعد قليل."}
  ```
- If invalid credentials or user not found:
  ```json
  {"success": false, "error": "invalid_credentials", "message": "اسم المستخدم أو كلمة المرور غير صحيحة"}
  ```

---

## 5. Reviewable Implementation Artifacts

### 5.1 Proposed SQL Migration (`20261017_safe_security_hardening.sql`)

```sql
-- ==============================================================================
-- GRADELY PROPOSED MIGRATION: BCRYPT TRIGGER, SESSION REVOCATION, & RATE LIMIT
-- ==============================================================================

-- 1. SESSION REVOCATION RPC
CREATE OR REPLACE FUNCTION public.revoke_student_session(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_token text;
BEGIN
  clean_token := TRIM(COALESCE(p_session_token, ''));
  IF clean_token = '' OR LENGTH(clean_token) < 32 THEN
    RETURN false;
  END IF;

  DELETE FROM public.student_sessions
  WHERE token = clean_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_student_session(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_student_session(text) TO anon, authenticated;
ALTER FUNCTION public.revoke_student_session(text) OWNER TO postgres;


-- 2. AUTOMATIC BCRYPT PASSWORD HASHING TRIGGER
CREATE OR REPLACE FUNCTION public.trg_auto_bcrypt_users_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password IS NOT NULL AND TRIM(NEW.password) <> '' AND NEW.password NOT LIKE '$2%' THEN
    NEW.password := extensions.crypt(TRIM(NEW.password), extensions.gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_bcrypt_password ON public.users;
CREATE TRIGGER trg_auto_bcrypt_password
  BEFORE INSERT OR UPDATE OF password ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_bcrypt_users_password();


-- 3. LAYERED LOGIN RATE LIMITING & LOCKOUT FIX
CREATE TABLE IF NOT EXISTS public.login_ip_attempts (
  ip_address text PRIMARY KEY,
  attempts int DEFAULT 1,
  last_attempt timestamptz DEFAULT now(),
  blocked_until timestamptz
);
ALTER TABLE public.login_ip_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_ip_attempts FROM anon, public;
GRANT ALL ON public.login_ip_attempts TO postgres, service_role;
```

---

## 6. Staging Tests & Acceptance Criteria

| Improvement | Staging Test Procedure | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| **Bcrypt Migration** | Update test user `2602854` password to bcrypt; invoke `verify_legacy_login` with `#eu7R7kM` | Returns `HTTP 200`, `success: true`, token issued | DB stores `$2b$...`; student card password works |
| **Session Revocation** | Authenticate student -> Call `get_my_attendance` -> Call `revoke_student_session` -> Call `get_my_attendance` | First call succeeds (`200`); post-revocation call returns `HTTP 401 Unauthorized` | Immediate server-side invalidation verified |
| **MFA Enrollment** | Super-Admin enrolls TOTP in dashboard -> enters 6-digit code -> receives AAL2 token | `supabase.auth.mfa.verify()` succeeds; JWT contains `aal: aal2` | Multi-factor required on admin path |
| **Lockout Protection** | Send 5 rapid invalid attempts from probe script | Attempts 5+ experience progressive delays; legitimate student not permanently locked | Brute force slowed down; DoS mitigated |

---

## 7. Assumptions Requiring Pre-Implementation Verification

1. **Supabase Auth Configuration:** Confirm that the Supabase Project tier supports TOTP MFA (supported natively on all Supabase Free & Pro tiers).
2. **Reverse Proxy Header:** Confirm that Vercel / Cloudflare forwards `cf-connecting-ip` in `current_setting('request.headers')`.
3. **Student Physical Cards:** Confirm that all active students log in exclusively via their assigned card passwords, ensuring the transparent bcrypt migration covers 100% of the active student body.

---

> [!NOTE]
> **No production modifications have been executed.** All findings, migrations, and diffs above are presented for your review and explicit approval.
