-- 021_legal_compliance.sql
-- Legal & Compliance tables for BisnisSehat
--
-- Tables:
--   legal_nib         - NIB (Nomor Induk Berusaha) records
--   legal_pirt        - PIRT (Pendaftaran Industri Rumah Tangga) records
--   legal_halal       - Halal certification records
--   legal_trademark   - Trademark registration records
--
-- IMPORTANT: BisnisSehat does NOT verify these records against government databases.
-- All data is user-reported. Status values reflect what the user declares.

-- ── Status enums ──
-- NOT_CHECKED   = Belum dicek (default)
-- USER_REPORTED = User menyatakan sudah memiliki
-- NEEDS_ACTION  = User belum memiliki / perlu tindakan
-- EXTERNAL_VERIFY = Harus diverifikasi di portal resmi

-- ══════════════════════════════════════════════════════════
-- NIB (Nomor Induk Berusaha)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_nib (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'NOT_CHECKED'
                CHECK (status IN ('NOT_CHECKED', 'USER_REPORTED', 'NEEDS_ACTION', 'EXTERNAL_VERIFY')),
  nib_number    text,                -- NIB number if user reports having one
  issued_date   date,                -- Date user says it was issued
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_nib_business_id ON legal_nib(business_id);

ALTER TABLE legal_nib ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_nib_owner_access"
  ON legal_nib
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════
-- PIRT (Pendaftaran Industri Rumah Tangga)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_pirt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'NOT_CHECKED'
                CHECK (status IN ('NOT_CHECKED', 'USER_REPORTED', 'NEEDS_ACTION', 'EXTERNAL_VERIFY')),
  pirt_number   text,                -- PIRT number if user reports having one
  issued_date   date,
  expiry_date   date,                -- PIRT expiry date if relevant
  products      text,                -- Product names covered by PIRT
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_pirt_business_id ON legal_pirt(business_id);

ALTER TABLE legal_pirt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_pirt_owner_access"
  ON legal_pirt
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════
-- Halal Certification (Sertifikasi Halal)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_halal (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'NOT_CHECKED'
                   CHECK (status IN ('NOT_CHECKED', 'USER_REPORTED', 'NEEDS_ACTION', 'EXTERNAL_VERIFY')),
  certificate_number text,            -- Certificate number if user reports having one
  issued_date      date,
  products         text,              -- Product names covered by halal cert
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_halal_business_id ON legal_halal(business_id);

ALTER TABLE legal_halal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_halal_owner_access"
  ON legal_halal
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════
-- Trademark Registration (Pendaftaran Merek)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_trademark (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'NOT_CHECKED'
                   CHECK (status IN ('NOT_CHECKED', 'USER_REPORTED', 'NEEDS_ACTION', 'EXTERNAL_VERIFY')),
  brand_name       text,              -- Brand/trademark name
  application_number text,            -- Application number if user reports one
  registered_date  date,
  trademark_class  text,              -- Nice classification class
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_trademark_business_id ON legal_trademark(business_id);

ALTER TABLE legal_trademark ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_trademark_owner_access"
  ON legal_trademark
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
