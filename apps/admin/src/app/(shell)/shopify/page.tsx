'use client'
import { useEffect, useState } from 'react'

export default function ShopifyPage() {
  const [products, setProducts] = useState<any[]>([])
  const [mappings, setMappings] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)

  useEffect(() => {
    fetch('/api/shopify/products')
      .then(r => r.json())
      .then(data => {
        if (data.error === 'not_connected') {
          setNotConnected(true)
        } else {
          setProducts(data.products || [])
          setMappings(data.mappings || [])
          setSubjects(data.subjects || [])
        }
        setLoading(false)
      })
  }, [])

  const getMapping = (productId: string) =>
    mappings.find(m => m.shopify_product_id === productId)

  const saveMapping = async (productId: string, subjectId: string, durationDays: string) => {
    await fetch('/api/shopify/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopify_product_id: productId,
        subject_id: subjectId,
        duration_days: durationDays ? parseInt(durationDays) : null
      })
    })
    const m = mappings.filter(m => m.shopify_product_id !== productId)
    setMappings([...m, { shopify_product_id: productId, subject_id: subjectId, duration_days: durationDays || null }])
  }

  const removeMapping = async (productId: string) => {
    await fetch('/api/shopify/mapping', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopify_product_id: productId })
    })
    setMappings(mappings.filter(m => m.shopify_product_id !== productId))
  }

  if (loading) return <div style={{padding:40,textAlign:'center'}}>جاري التحميل...</div>

  if (notConnected) return (
    <div style={{padding:40,textAlign:'center'}}>
      <h2 style={{marginBottom:20}}>لم يتم ربط Shopify بعد</h2>
      <a href="/api/shopify/auth" style={{background:'#5c6ac4',color:'#fff',padding:'12px 24px',borderRadius:8,textDecoration:'none',fontSize:16}}>
        ربط Shopify الآن
      </a>
    </div>
  )

  return (
    <div style={{padding:32,maxWidth:900,margin:'0 auto'}}>
      <h1 style={{fontSize:24,fontWeight:700,marginBottom:24}}>منتجات Shopify</h1>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'#f1f5f9'}}>
            <th style={{padding:'12px 16px',textAlign:'right'}}>المنتج</th>
            <th style={{padding:'12px 16px',textAlign:'right'}}>المادة</th>
            <th style={{padding:'12px 16px',textAlign:'right'}}>المدة (أيام)</th>
            <th style={{padding:'12px 16px',textAlign:'right'}}>حفظ</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const mapping = getMapping(String(p.id))
            return (
              <ProductRow
                key={p.id}
                product={p}
                mapping={mapping}
                subjects={subjects}
                onSave={saveMapping}
                onRemove={removeMapping}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProductRow({ product, mapping, subjects, onSave, onRemove }: any) {
  const [subjectId, setSubjectId] = useState(mapping?.subject_id || '')
  const [duration, setDuration] = useState(mapping?.duration_days || '')

  return (
    <tr style={{borderBottom:'1px solid #e2e8f0'}}>
      <td style={{padding:'12px 16px'}}>{product.title}</td>
      <td style={{padding:'12px 16px'}}>
        <select
          value={subjectId}
          onChange={e => setSubjectId(e.target.value)}
          style={{padding:'6px 12px',borderRadius:6,border:'1px solid #cbd5e1',width:'100%'}}
        >
          <option value=''>-- اختر مادة --</option>
          {subjects.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </td>
      <td style={{padding:'12px 16px'}}>
        <input
          type='number'
          value={duration}
          onChange={e => setDuration(e.target.value)}
          placeholder='فارغ = مدى الحياة'
          style={{padding:'6px 12px',borderRadius:6,border:'1px solid #cbd5e1',width:'100%'}}
        />
      </td>
      <td style={{padding:'12px 16px'}}>
        <button
          onClick={() => onSave(String(product.id), subjectId, duration)}
          style={{background:'#10b981',color:'#fff',padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',marginLeft:8}}
        >حفظ</button>
        {mapping && (
          <button
            onClick={() => onRemove(String(product.id))}
            style={{background:'#ef4444',color:'#fff',padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer'}}
          >حذف</button>
        )}
      </td>
    </tr>
  )
}
