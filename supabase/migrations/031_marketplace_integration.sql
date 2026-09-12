-- 031_marketplace_integration.sql
-- Marketplace Integration: connections, product mapping, order sync, sync logs
--
-- Changes:
--   1. CREATE marketplace_connections: store encrypted credentials per marketplace
--   2. CREATE marketplace_products: mapping between marketplace and local products
--   3. CREATE marketplace_orders: synced orders from marketplaces
--   4. CREATE marketplace_sync_logs: immutable audit trail for all sync operations
--   5. RLS policies (owner-scoped)
--   6. Indexes for performance

-- ══════════════════════════════════════════════════════════
-- 1. MARKETPLACE CONNECTIONS
-- ══════════════════════════════════════════════════════════
-- Stores connection state and encrypted API credentials for each marketplace.
-- Credentials are encrypted server-side (Edge Functions) and never exposed to frontend.

CREATE TABLE IF NOT EXISTS marketplace_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  marketplace           text NOT NULL CHECK (marketplace IN ('shopee', 'tokopedia', 'tiktokshop')),
  status                text NOT NULL DEFAULT 'disconnected' CHECK (status IN (
    'disconnected',   -- No credentials configured
    'pending',        -- Credentials submitted, testing connection
    'connected',      -- Active and verified
    'error'           -- Connection failed or token expired
  )),
  -- Encrypted credentials — accessed only by Edge Functions (service_role)
  credentials_encrypted text DEFAULT NULL,
  -- Connection metadata (safe to expose to frontend)
  shop_name             text DEFAULT '',
  shop_id               text DEFAULT '',
  shop_url              text DEFAULT '',
  -- Webhook configuration
  webhook_secret        text DEFAULT NULL,
  -- Sync state
  last_sync_at          timestamptz,
  last_error            text DEFAULT '',
  error_count           integer DEFAULT 0,
  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, marketplace)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_connections_business
  ON marketplace_connections(business_id, marketplace);

ALTER TABLE marketplace_connections ENABLE ROW LEVEL SECURITY;

-- Owner can read connection metadata (not credentials)
CREATE POLICY "marketplace_connections_owner_select"
  ON marketplace_connections FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can insert connections for their business
CREATE POLICY "marketplace_connections_owner_insert"
  ON marketplace_connections FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can update their own connections
CREATE POLICY "marketplace_connections_owner_update"
  ON marketplace_connections FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can delete their connections
CREATE POLICY "marketplace_connections_owner_delete"
  ON marketplace_connections FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════
-- 2. MARKETPLACE PRODUCTS (product mapping)
-- ══════════════════════════════════════════════════════════
-- Maps marketplace products to local BisnisSehat products.
-- SKU is the primary matching identifier.

CREATE TABLE IF NOT EXISTS marketplace_products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connection_id           uuid NOT NULL REFERENCES public.marketplace_connections(id) ON DELETE CASCADE,
  marketplace_product_id  text NOT NULL,  -- marketplace's product/item ID
  -- Local product link (nullable — product may not be imported yet)
  local_product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  -- Marketplace product data (cached from last sync)
  marketplace_name        text NOT NULL DEFAULT '',
  marketplace_sku         text DEFAULT '',
  marketplace_price       numeric(15,2) DEFAULT 0,
  marketplace_stock       integer DEFAULT 0,
  marketplace_image_url   text DEFAULT '',
  marketplace_category    text DEFAULT '',
  marketplace_status      text DEFAULT 'active',  -- active/inactive/sold_out
  -- Sync configuration
  sync_price              boolean DEFAULT true,
  sync_stock              boolean DEFAULT true,
  sync_direction          text DEFAULT 'manual' CHECK (sync_direction IN (
    'to_marketplace',     -- Push local changes to marketplace
    'from_marketplace',   -- Pull marketplace changes to local
    'bidirectional',      -- Two-way sync
    'manual'              -- No auto-sync
  )),
  sync_status             text DEFAULT 'idle' CHECK (sync_status IN (
    'idle', 'syncing', 'synced', 'error'
  )),
  last_synced_at          timestamptz,
  sync_error              text DEFAULT '',
  -- Timestamps
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, marketplace_product_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_business
  ON marketplace_products(business_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_connection
  ON marketplace_products(connection_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_local_product
  ON marketplace_products(local_product_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_sku
  ON marketplace_products(marketplace_sku);

ALTER TABLE marketplace_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_products_owner_select"
  ON marketplace_products FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_products_owner_insert"
  ON marketplace_products FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_products_owner_update"
  ON marketplace_products FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_products_owner_delete"
  ON marketplace_products FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════
-- 3. MARKETPLACE ORDERS
-- ══════════════════════════════════════════════════════════
-- Synced orders from connected marketplaces.

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connection_id           uuid NOT NULL REFERENCES public.marketplace_connections(id) ON DELETE CASCADE,
  marketplace_order_id    text NOT NULL,
  -- Local order link (nullable — order may not be created in POS yet)
  local_order_id          uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  -- Order data
  buyer_name              text DEFAULT '',
  buyer_address           text DEFAULT '',
  buyer_phone             text DEFAULT '',
  shipping_method         text DEFAULT '',
  tracking_number         text DEFAULT '',
  -- Line items stored as JSONB
  items                   jsonb DEFAULT '[]',  -- [{ product_name, marketplace_sku, quantity, unit_price, subtotal }]
  subtotal                numeric(15,2) DEFAULT 0,
  shipping_fee            numeric(15,2) DEFAULT 0,
  total_amount            numeric(15,2) DEFAULT 0,
  -- Status tracking
  order_status            text NOT NULL DEFAULT 'pending' CHECK (order_status IN (
    'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned'
  )),
  payment_status          text DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'paid', 'refunded'
  )),
  payment_method          text DEFAULT '',
  -- Timestamps from marketplace
  marketplace_created_at  timestamptz,
  shipped_at              timestamptz,
  delivered_at            timestamptz,
  completed_at            timestamptz,
  -- Raw API response for debugging
  raw_data                jsonb DEFAULT '{}',
  -- Sync state
  synced_at               timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, marketplace_order_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_business
  ON marketplace_orders(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_connection
  ON marketplace_orders(connection_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status
  ON marketplace_orders(order_status);

ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_orders_owner_select"
  ON marketplace_orders FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_orders_owner_insert"
  ON marketplace_orders FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_orders_owner_update"
  ON marketplace_orders FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════
-- 4. MARKETPLACE SYNC LOGS
-- ══════════════════════════════════════════════════════════
-- Immutable audit trail for all sync operations.
-- Same pattern as stock_movements: INSERT only, no UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS marketplace_sync_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connection_id   uuid REFERENCES public.marketplace_connections(id) ON DELETE SET NULL,
  marketplace     text NOT NULL,
  sync_type       text NOT NULL CHECK (sync_type IN (
    'products',          -- Product sync (import/export)
    'orders',            -- Order sync
    'inventory',         -- Stock sync
    'connection_test',   -- Connection verification
    'webhook',           -- Webhook received
    'credentials'        -- Credential update
  )),
  direction       text CHECK (direction IN ('inbound', 'outbound')),
  status          text NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  items_synced    integer DEFAULT 0,
  items_failed    integer DEFAULT 0,
  error_message   text DEFAULT NULL,
  duration_ms     integer DEFAULT 0,
  details         jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sync_logs_business
  ON marketplace_sync_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_sync_logs_connection
  ON marketplace_sync_logs(connection_id);

ALTER TABLE marketplace_sync_logs ENABLE ROW LEVEL SECURITY;

-- Owner can read logs
CREATE POLICY "marketplace_sync_logs_owner_select"
  ON marketplace_sync_logs FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can insert logs (via Edge Functions with service_role, or client-side)
CREATE POLICY "marketplace_sync_logs_owner_insert"
  ON marketplace_sync_logs FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- No update/delete policies — sync logs are immutable audit trail.

-- ══════════════════════════════════════════════════════════
-- 5. UPDATED_AT TRIGGER
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_marketplace_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_connections_updated_at
  BEFORE UPDATE ON marketplace_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_marketplace_updated_at();

CREATE TRIGGER marketplace_products_updated_at
  BEFORE UPDATE ON marketplace_products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_marketplace_updated_at();

CREATE TRIGGER marketplace_orders_updated_at
  BEFORE UPDATE ON marketplace_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_marketplace_updated_at();
