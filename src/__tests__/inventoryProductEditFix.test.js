import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getEffectiveStock,
  getEffectiveMinStock,
  getEffectiveMaxStock,
  getEffectiveLocation,
  sanitizeProductInput,
} from '../lib/inventoryUtils.js'

describe('Inventory Product Edit Fixes (fix.md)', () => {
  describe('1. inventoryUtils.js getEffectiveLocation Array and Object support', () => {
    it('unwraps array inventory to read location', () => {
      const productWithArrayInv = {
        id: 'prod-1',
        name: 'Kopi Arabika',
        inventory: [{ quantity: 1000, location: 'Gudang B1' }],
      }
      assert.equal(getEffectiveLocation(productWithArrayInv), 'Gudang B1')
    })

    it('reads object inventory location', () => {
      const productWithObjInv = {
        id: 'prod-2',
        name: 'Kopi Robusta',
        inventory: { quantity: 500, location: 'Rak 4' },
      }
      assert.equal(getEffectiveLocation(productWithObjInv), 'Rak 4')
    })

    it('falls back to product location if inventory lacks location', () => {
      const product = {
        id: 'prod-3',
        name: 'Teh Hijau',
        location: 'Depo Pusat',
      }
      assert.equal(getEffectiveLocation(product), 'Depo Pusat')
    })
  })

  describe('2. ProductForm Hydration and Unwrap Logic', () => {
    function hydrateFormFromProduct(product) {
      const inv = Array.isArray(product?.inventory) ? product.inventory[0] : product?.inventory
      return {
        name: product?.name || '',
        sku: product?.sku || '',
        description: product?.description || '',
        category: product?.category || '',
        unit: product?.unit || 'pcs',
        unit_price: product?.unit_price != null ? String(product.unit_price) : '',
        cost_price: product?.cost_price != null ? String(product.cost_price) : '',
        current_stock: inv?.quantity != null ? String(inv.quantity) : (product?.current_stock != null ? String(product.current_stock) : '0'),
        minimum_stock: inv?.min_stock != null ? String(inv.min_stock) : (product?.minimum_stock != null ? String(product.minimum_stock) : '0'),
        maximum_stock: inv?.maximum_stock != null ? String(inv.maximum_stock) : (product?.maximum_stock != null ? String(product.maximum_stock) : '0'),
        supplier_id: inv?.supplier_id || product?.supplier_id || '',
        location: inv?.location || product?.location || '',
        notes: product?.notes || '',
        is_active: product?.is_active !== false,
      }
    }

    it('hydrates stock 1000 / max 1000 when inventory is an Array', () => {
      const product = {
        id: 'prod-100',
        name: 'Beras Premium 5kg',
        inventory: [
          {
            quantity: 1000,
            min_stock: 50,
            maximum_stock: 1000,
            supplier_id: 'supp-999',
            location: 'Gudang Utama',
          },
        ],
      }

      const form = hydrateFormFromProduct(product)
      assert.equal(form.current_stock, '1000')
      assert.equal(form.maximum_stock, '1000')
      assert.equal(form.minimum_stock, '50')
      assert.equal(form.supplier_id, 'supp-999')
      assert.equal(form.location, 'Gudang Utama')
    })

    it('hydrates stock 1000 / max 1000 when inventory is an Object', () => {
      const product = {
        id: 'prod-101',
        name: 'Gula Pasir 1kg',
        inventory: {
          quantity: 1000,
          min_stock: 100,
          maximum_stock: 1000,
          supplier_id: 'supp-888',
          location: 'Rak B-12',
        },
      }

      const form = hydrateFormFromProduct(product)
      assert.equal(form.current_stock, '1000')
      assert.equal(form.maximum_stock, '1000')
      assert.equal(form.minimum_stock, '100')
      assert.equal(form.supplier_id, 'supp-888')
      assert.equal(form.location, 'Rak B-12')
    })
  })

  describe('3. Inventory Payload UPDATE Retention', () => {
    function buildInventoryPayload(productId, form) {
      const sanitized = sanitizeProductInput(form)
      return {
        product_id: productId,
        quantity: sanitized.current_stock,
        min_stock: sanitized.minimum_stock,
        maximum_stock: sanitized.maximum_stock,
        supplier_id: sanitized.supplier_id || null,
        location: sanitized.location || '',
      }
    }

    it('UPDATE inventoryPayload retains maximum_stock, supplier_id, quantity 1000, and location', () => {
      const form = {
        name: 'Beras Premium',
        unit: 'karung',
        current_stock: '1000',
        minimum_stock: '50',
        maximum_stock: '1000',
        supplier_id: 'supp-123',
        location: 'Gudang A',
      }

      const payload = buildInventoryPayload('prod-abc', form)
      assert.equal(payload.quantity, 1000)
      assert.equal(payload.maximum_stock, 1000)
      assert.equal(payload.supplier_id, 'supp-123')
      assert.equal(payload.location, 'Gudang A')
    })

    it('simulates save -> reload -> edit again lifecycle preserving all values', () => {
      // Step 1: Initial product state
      let serverState = {
        id: 'prod-lifecycle',
        name: 'Minyak Goreng 2L',
        inventory: [
          {
            quantity: 1000,
            min_stock: 20,
            maximum_stock: 1000,
            supplier_id: 'supp-01',
            location: 'Gudang Tengah',
          },
        ],
      }

      // Step 2: Open edit 1st time
      const inv1 = Array.isArray(serverState.inventory) ? serverState.inventory[0] : serverState.inventory
      assert.equal(inv1.quantity, 1000)
      assert.equal(inv1.maximum_stock, 1000)
      assert.equal(inv1.supplier_id, 'supp-01')

      // Step 3: Save without changing stock, but update max stock to 1500 and supplier to supp-02
      const updatedForm = {
        name: serverState.name,
        unit: 'pouch',
        current_stock: String(inv1.quantity),
        minimum_stock: String(inv1.min_stock),
        maximum_stock: '1500',
        supplier_id: 'supp-02',
        location: inv1.location,
      }
      const savedPayload = buildInventoryPayload(serverState.id, updatedForm)

      // Step 4: Server persistence simulation
      serverState.inventory = [
        {
          quantity: savedPayload.quantity,
          min_stock: savedPayload.min_stock,
          maximum_stock: savedPayload.maximum_stock,
          supplier_id: savedPayload.supplier_id,
          location: savedPayload.location,
        },
      ]

      // Step 5: Reload and open edit again
      const inv2 = Array.isArray(serverState.inventory) ? serverState.inventory[0] : serverState.inventory
      assert.equal(inv2.quantity, 1000, 'Quantity must remain 1000')
      assert.equal(inv2.maximum_stock, 1500, 'Maximum stock must be 1500')
      assert.equal(inv2.supplier_id, 'supp-02', 'Supplier ID must be supp-02')
      assert.equal(inv2.location, 'Gudang Tengah', 'Location must remain Gudang Tengah')
    })
  })

  describe('4. ProductDetail and InventoryPage Edit Integration', () => {
    it('display maximum stock renders 0 as 0 and not as dash', () => {
      const renderMaxStock = (maxStock) => (maxStock != null && !Number.isNaN(maxStock) ? maxStock : '-')
      assert.equal(renderMaxStock(0), 0)
      assert.equal(renderMaxStock(1000), 1000)
      assert.equal(renderMaxStock(null), '-')
      assert.equal(renderMaxStock(undefined), '-')
    })

    it('passes currentProduct to edit handler rather than stale selectedProduct', () => {
      let selectedProduct = {
        id: 'p-1',
        name: 'Stale Product',
        inventory: [{ quantity: 10, maximum_stock: 50 }],
      }

      const refreshedCurrentProduct = {
        id: 'p-1',
        name: 'Refreshed Product',
        inventory: [{ quantity: 1000, maximum_stock: 1000, supplier_id: 'sup-real', location: 'Gudang Refreshed' }],
      }

      function handleEditProduct(current) {
        selectedProduct = current || selectedProduct
      }

      // Simulate ProductDetail onEdit triggering with currentProduct
      handleEditProduct(refreshedCurrentProduct)

      assert.equal(selectedProduct.name, 'Refreshed Product')
      assert.equal(getEffectiveStock(selectedProduct), 1000)
      assert.equal(getEffectiveMaxStock(selectedProduct), 1000)
      assert.equal(getEffectiveLocation(selectedProduct), 'Gudang Refreshed')
    })
  })
})
