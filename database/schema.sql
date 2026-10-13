-- =============================================================================
-- GUCO - Guidance and Counseling Request Management and Feedback Evaluation
-- System (BPSU Main Campus)
-- MySQL 8.0+ (also works on MariaDB 10.5+)  |  Engine: InnoDB  |  utf8mb4
--
-- Run:  mysql -u root -p < database/schema.sql      (or:  npm run db:init)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS guco
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE guco;

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- USERS & AUTHENTICATION
-- One row per login (admin, personnel or student). Passwords are bcrypt hashes;
-- the plain password is never stored. token_version is bumped on every password
-- change/reset so previously issued session tokens stop working.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(190)    NOT NULL,
  password_hash  VARCHAR(100)    NOT NULL,
  role           ENUM('admin','personnel','student') NOT NULL,
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,      -- 0 = disabled (personnel can be switched off)
  token_version  INT UNSIGNED    NOT NULL DEFAULT 0,
  failed_logins  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until   DATETIME        NULL,
  last_login_at  DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

-- Staff (admin + personnel) display name
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  name    VARCHAR(150)    NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Which staff-portal sections a personnel account may open (admin: always all)
CREATE TABLE IF NOT EXISTS personnel_permissions (
  user_id BIGINT UNSIGNED NOT NULL,
  section ENUM('requests','peers','live','evaluations','programs','holidays','accounts') NOT NULL,
  PRIMARY KEY (user_id, section),
  CONSTRAINT fk_perm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Student details + ID-verification status
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id         BIGINT UNSIGNED NOT NULL,
  student_id      VARCHAR(8)      NOT NULL,                -- 21-00000
  last_name       VARCHAR(80)     NOT NULL,
  first_name      VARCHAR(80)     NOT NULL,
  middle_name     VARCHAR(80)     NOT NULL DEFAULT '',
  suffix          VARCHAR(20)     NOT NULL DEFAULT '',
  gender          VARCHAR(30)     NOT NULL,
  contact         VARCHAR(11)     NOT NULL,                -- 09XXXXXXXXX
  program         VARCHAR(200)    NOT NULL,
  major           VARCHAR(200)    NOT NULL DEFAULT 'N/A',
  year_level      VARCHAR(20)     NOT NULL,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_at     DATETIME        NULL,
  reviewed_by     BIGINT UNSIGNED NULL,
  reject_reason   VARCHAR(500)    NOT NULL DEFAULT '',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A student ID may be reused only after the account holding it was rejected.
  active_student_id VARCHAR(8) GENERATED ALWAYS AS
      (IF(approval_status = 'rejected', NULL, student_id)) STORED,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_student_active_id (active_student_id),
  KEY idx_student_status (approval_status, created_at),
  CONSTRAINT fk_student_user     FOREIGN KEY (user_id)     REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_student_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- School-ID photos for verification. Deleted as soon as staff approve/reject.
CREATE TABLE IF NOT EXISTS student_id_photos (
  user_id    BIGINT UNSIGNED NOT NULL,
  front      MEDIUMTEXT      NOT NULL,                     -- data:image/jpeg;base64,...
  back       MEDIUMTEXT      NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_idphoto_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id    BIGINT UNSIGNED NOT NULL,
  image      MEDIUMTEXT      NOT NULL,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_avatar_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- One-time password-reset links. Only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64)        NOT NULL,
  expires_at DATETIME        NOT NULL,
  used_at    DATETIME        NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token (token_hash),
  KEY idx_reset_user (user_id, created_at),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- REFERENCE DATA (managed by staff)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(200)    NOT NULL,
  level      ENUM('Undergraduate','Post-graduate','Graduate') NOT NULL,
  sort_order INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_program_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS program_majors (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  name       VARCHAR(200)    NOT NULL,
  sort_order INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_major (program_id, name),
  CONSTRAINT fk_major_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS holidays (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  holiday_date DATE            NOT NULL,
  name         VARCHAR(150)    NOT NULL,
  type         ENUM('Regular holiday','Special non-working day','Local holiday','Office closure') NOT NULL,
  is_yearly    TINYINT(1)      NOT NULL DEFAULT 0,          -- 1 = same month/day every year
  PRIMARY KEY (id),
  KEY idx_holiday_date (holiday_date)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- STUDENT REQUESTS (10 types) + proof of completed sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requests (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ref             VARCHAR(30)     NOT NULL,                 -- e.g. FF-20261012-4821
  type            ENUM('facetoface','academic','followup','peer','online',
                       'goodmoral','returning','failing','exittransfer','exitgrad') NOT NULL,
  req_group       ENUM('session','document') NOT NULL,
  student_user_id BIGINT UNSIGNED NULL,
  account_email   VARCHAR(190)    NOT NULL,
  student_id      VARCHAR(8)      NOT NULL,
  last_name       VARCHAR(80)     NOT NULL,
  first_name      VARCHAR(80)     NOT NULL,
  middle_name     VARCHAR(80)     NOT NULL DEFAULT 'N/A',
  suffix          VARCHAR(20)     NOT NULL DEFAULT 'N/A',
  program         VARCHAR(200)    NOT NULL,
  major           VARCHAR(200)    NOT NULL DEFAULT 'N/A',
  year_level      VARCHAR(20)     NOT NULL,
  contact         VARCHAR(60)     NOT NULL,
  preferred_date  DATE            NULL,
  notes           TEXT            NULL,
  status          ENUM('pending','scheduled','done') NOT NULL DEFAULT 'pending',
  submitted_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at    DATETIME        NULL,
  handled_by      BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_ref (ref),
  KEY idx_req_student (student_user_id, req_group, status),
  KEY idx_req_status (status, submitted_at),
  KEY idx_req_type (type),
  CONSTRAINT fk_req_student FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_req_handler FOREIGN KEY (handled_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_evidence (
  request_id  BIGINT UNSIGNED NOT NULL,
  filename    VARCHAR(255)    NOT NULL,
  image       MEDIUMTEXT      NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  uploaded_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  CONSTRAINT fk_evidence_request  FOREIGN KEY (request_id)  REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- PEER SUPPORT DIRECTORY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS peers (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  last_name      VARCHAR(80)     NOT NULL,
  first_name     VARCHAR(80)     NOT NULL,
  middle_initial VARCHAR(5)      NOT NULL DEFAULT '',
  suffix         VARCHAR(20)     NOT NULL DEFAULT '',
  program        VARCHAR(200)    NOT NULL DEFAULT '',
  year           VARCHAR(30)     NOT NULL DEFAULT '',
  days           VARCHAR(80)     NOT NULL DEFAULT '',       -- "Mon, Wed"
  time_from      CHAR(5)         NULL,                      -- HH:MM
  time_to        CHAR(5)         NULL,
  photo          MEDIUMTEXT      NULL,
  status         ENUM('pending','active') NOT NULL DEFAULT 'pending',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_peer_status (status)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- LIVE SESSIONS & REPLAY HUB
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_sessions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title        VARCHAR(200)    NOT NULL,
  details      TEXT            NOT NULL,
  link         VARCHAR(500)    NOT NULL DEFAULT '#',
  session_date VARCHAR(60)     NOT NULL DEFAULT '',
  status       ENUM('scheduled','done') NOT NULL DEFAULT 'scheduled',   -- done = replay posted
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_live_created (created_at),
  CONSTRAINT fk_live_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS eval_qrs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id   BIGINT UNSIGNED NOT NULL,
  qr_type      VARCHAR(30)     NOT NULL DEFAULT '',
  label        VARCHAR(200)    NOT NULL DEFAULT '',
  image        MEDIUMTEXT      NOT NULL,
  results_link VARCHAR(500)    NOT NULL DEFAULT '',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qr_session (session_id),
  CONSTRAINT fk_qr_session FOREIGN KEY (session_id) REFERENCES live_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- POST-SESSION EVALUATIONS (satisfaction ratings are computed live from this)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service         VARCHAR(120)    NOT NULL,
  rating          TINYINT UNSIGNED NOT NULL,
  comment         TEXT            NULL,
  request_ref     VARCHAR(30)     NULL,                     -- the request being evaluated
  student_user_id BIGINT UNSIGNED NULL,
  submitted_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_eval_request (request_ref),                 -- one evaluation per request (NULLs allowed)
  KEY idx_eval_service (service),
  KEY idx_eval_student (student_user_id),
  CONSTRAINT chk_eval_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_eval_request FOREIGN KEY (request_ref)     REFERENCES requests (ref) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_eval_student FOREIGN KEY (student_user_id) REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- AUDIT TRAIL (sign-ins, account approvals, request status changes, ...)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NULL,
  action     VARCHAR(60)     NOT NULL,
  entity     VARCHAR(40)     NULL,
  entity_id  VARCHAR(60)     NULL,
  detail     VARCHAR(500)    NULL,
  ip         VARCHAR(45)     NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id, created_at),
  KEY idx_audit_action (action, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;
