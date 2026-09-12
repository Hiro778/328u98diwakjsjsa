import { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'bs_product_catalog'

const ProductCatalogContext = createContext(null)

function loadProducts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function ProductCatalogProvider({ children }) {
  const [products, setProducts] = useState(loadProducts)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products))
  }, [products])

  function addProduct(data) {
    const product = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setProducts((prev) => [...prev, product])
    return product
  }

  function updateProduct(id, data) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...data } : p))
    )
  }

  function removeProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  function getProduct(id) {
    return products.find((p) => p.id === id)
  }

  return (
    <ProductCatalogContext.Provider
      value={{ products, addProduct, updateProduct, removeProduct, getProduct }}
    >
      {children}
    </ProductCatalogContext.Provider>
  )
}

export function useProductCatalog() {
  const ctx = useContext(ProductCatalogContext)
  if (!ctx) throw new Error('useProductCatalog must be used within ProductCatalogProvider')
  return ctx
}
