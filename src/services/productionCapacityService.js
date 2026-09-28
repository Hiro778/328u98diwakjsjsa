import { supabase } from '../lib/supabase.js'

/**
 * Pure calculation functions for Production Capacity Planner
 */

export function calculateMaterialBatches(inventoryMap, bomItems) {
  let minBatches = 0
  let bottleneck = null
  const breakdown = []
  const warnings = []

  if (!bomItems || bomItems.length === 0) {
    return { maxBatches: 0, bottleneck: null, breakdown: [], warnings: ['BOM kosong atau belum diatur.'] }
  }

  let validItemsCount = 0

  for (const item of bomItems) {
    const materialId = item.material_product_id
    const rawStock = inventoryMap[materialId]
    const stockQty = (rawStock !== undefined && rawStock !== null && !isNaN(rawStock)) ? Number(rawStock) : 0
    const requiredPerBatch = Number(item.quantity_required)

    if (isNaN(requiredPerBatch) || requiredPerBatch <= 0) {
      warnings.push(`Bahan "${item.material?.name || materialId}" memiliki jumlah kebutuhan <= 0 dan diabaikan dari perhitungan.`)
      continue
    }

    validItemsCount++
    const possibleBatches = Math.floor(stockQty / requiredPerBatch)

    breakdown.push({
      materialId,
      materialName: item.material?.name || 'Bahan',
      unit: item.unit,
      stock: stockQty,
      requiredPerBatch,
      possibleBatches: isNaN(possibleBatches) ? 0 : possibleBatches,
    })

    if (validItemsCount === 1 || possibleBatches < minBatches) {
      minBatches = possibleBatches
      bottleneck = item
    }
  }

  if (validItemsCount === 0) {
    return { maxBatches: 0, bottleneck: null, breakdown, warnings: [...warnings, 'Tidak ada item BOM yang valid untuk perhitungan kapasitas.'] }
  }

  if (isNaN(minBatches) || minBatches < 0) {
    minBatches = 0
  }

  return { maxBatches: minBatches, bottleneck, breakdown, warnings }
}

export function calculateRequirements(targetBatches, bomItems) {
  const requirements = {}
  const validBatches = (!isNaN(targetBatches) && targetBatches > 0) ? Number(targetBatches) : 0
  if (!bomItems) return requirements

  for (const item of bomItems) {
    const req = Number(item.quantity_required)
    if (!isNaN(req) && req > 0) {
      requirements[item.material_product_id] = req * validBatches
    } else {
      requirements[item.material_product_id] = 0
    }
  }
  return requirements
}

export function calculateShortages(inventoryMap, requirements, bomItems) {
  const shortages = []
  if (!bomItems) return shortages

  for (const item of bomItems) {
    const materialId = item.material_product_id
    const required = Number(requirements[materialId] || 0)
    const rawStock = inventoryMap[materialId]
    const stock = (rawStock !== undefined && rawStock !== null && !isNaN(rawStock)) ? Number(rawStock) : 0

    if (stock < required) {
      shortages.push({
        materialId,
        materialName: item.material?.name || 'Bahan',
        required,
        stock,
        shortage: required - stock,
        unit: item.unit,
      })
    }
  }
  return shortages
}

/**
 * DB Fetchers and Data Actions
 */

export async function fetchProducts(businessId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
  if (error) throw error
  return data || []
}

export async function fetchInventory(businessId) {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, product:products!inner(id, name, unit)')
    .eq('product.business_id', businessId)
  if (error) throw error
  return data || []
}

export async function fetchBoms(businessId, productId) {
  let query = supabase
    .from('production_boms')
    .select('*, items:production_bom_items(*, material:products!material_product_id(id, name, unit))')
    .eq('business_id', businessId)

  if (productId) {
    query = query.eq('product_id', productId)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function saveBom(businessId, bomData, items) {
  let bomId = bomData.id
  if (!bomId) {
    const { data, error } = await supabase
      .from('production_boms')
      .insert({
        business_id: businessId,
        product_id: bomData.product_id,
        name: bomData.name,
        batch_size: Number(bomData.batch_size) > 0 ? Number(bomData.batch_size) : 1,
        batch_unit: bomData.batch_unit || 'pcs',
        notes: bomData.notes || '',
      })
      .select()
      .single()
    if (error) throw error
    bomId = data.id
  } else {
    const { error } = await supabase
      .from('production_boms')
      .update({
        name: bomData.name,
        batch_size: Number(bomData.batch_size) > 0 ? Number(bomData.batch_size) : 1,
        batch_unit: bomData.batch_unit || 'pcs',
        notes: bomData.notes || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bomId)
      .eq('business_id', businessId)
    if (error) throw error

    await supabase.from('production_bom_items').delete().eq('bom_id', bomId)
  }

  if (items && items.length > 0) {
    const itemsPayload = items
      .filter((i) => Number(i.quantity_required) > 0)
      .map((i) => ({
        bom_id: bomId,
        material_product_id: i.material_product_id,
        quantity_required: Number(i.quantity_required),
        unit: i.unit || 'kg',
        notes: i.notes || '',
      }))
    if (itemsPayload.length > 0) {
      const { error: itemsError } = await supabase
        .from('production_bom_items')
        .insert(itemsPayload)
      if (itemsError) throw itemsError
    }
  }

  return bomId
}

export async function deleteBom(businessId, bomId) {
  const { error } = await supabase
    .from('production_boms')
    .delete()
    .eq('id', bomId)
    .eq('business_id', businessId)
  if (error) throw error
}

export async function fetchProductionSettings(businessId, productId) {
  const { data, error } = await supabase
    .from('production_settings')
    .select('*')
    .eq('business_id', businessId)
    .eq('product_id', productId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveProductionSettings(businessId, settingsData) {
  const payload = {
    business_id: businessId,
    product_id: settingsData.product_id,
    batch_capacity: Number(settingsData.batch_capacity) > 0 ? Number(settingsData.batch_capacity) : 1,
    batch_unit: settingsData.batch_unit || 'pcs',
    production_time_minutes: Number(settingsData.production_time_minutes) >= 0 ? Number(settingsData.production_time_minutes) : 0,
    workers_required: Number(settingsData.workers_required) > 0 ? Number(settingsData.workers_required) : 1,
    work_hours_per_day: Number(settingsData.work_hours_per_day) > 0 ? Number(settingsData.work_hours_per_day) : 8,
    work_days_per_period: Number(settingsData.work_days_per_period) > 0 ? Number(settingsData.work_days_per_period) : 30,
    notes: settingsData.notes || '',
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('production_settings')
    .upsert(payload, { onConflict: 'product_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchSuppliers(businessId) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('business_id', businessId)
  if (error) throw error
  return data || []
}
