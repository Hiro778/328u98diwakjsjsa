import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DateInput from '../src/components/DateInput'

describe('DateInput', () => {
  // A. Date input memiliki type="date"
  it('A. renders with type="date"', () => {
    render(<DateInput value="" onChange={() => {}} />)
    expect(document.querySelector('input[type="date"]')).toBeTruthy()
  })

  // B. Date input memiliki cursor-pointer
  it('B. has cursor-pointer class', () => {
    render(<DateInput value="" onChange={() => {}} />)
    const input = document.querySelector('input[type="date"]')
    expect(input.className).toContain('cursor-pointer')
  })

  // C. click handler memanggil showPicker() ketika tersedia
  it('C. calls showPicker() on click when available', () => {
    render(<DateInput value="" onChange={() => {}} />)
    const input = document.querySelector('input[type="date"]')
    const mockShowPicker = vi.fn()
    input.showPicker = mockShowPicker
    fireEvent.click(input)
    expect(mockShowPicker).toHaveBeenCalledTimes(1)
  })

  // D. jika showPicker tidak tersedia → tidak crash
  it('D. does not crash when showPicker is unavailable', () => {
    render(<DateInput value="" onChange={() => {}} />)
    const input = document.querySelector('input[type="date"]')
    // Simulate browser tanpa showPicker support
    Object.defineProperty(input, 'showPicker', {
      value: undefined,
      writable: true,
    })
    expect(() => fireEvent.click(input)).not.toThrow()
  })

  // D2. showPicker yang throw error → tidak crash
  it('D2. does not crash when showPicker throws', () => {
    render(<DateInput value="" onChange={() => {}} />)
    const input = document.querySelector('input[type="date"]')
    input.showPicker = () => { throw new DOMException('Not allowed') }
    expect(() => fireEvent.click(input)).not.toThrow()
  })

  // E. existing onChange tetap bekerja
  it('E. calls onChange handler when value changes', () => {
    const handleChange = vi.fn()
    render(<DateInput value="" onChange={handleChange} />)
    const input = document.querySelector('input[type="date"]')
    fireEvent.change(input, { target: { value: '2025-12-01' } })
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  // F. existing min/max tetap bekerja
  it('F. passes min and max attributes', () => {
    render(<DateInput value="" onChange={() => {}} min="2025-01-01" max="2025-12-31" />)
    const input = document.querySelector('input[type="date"]')
    expect(input.getAttribute('min')).toBe('2025-01-01')
    expect(input.getAttribute('max')).toBe('2025-12-31')
  })

  // G. existing required tetap bekerja
  it('G. passes required attribute', () => {
    render(<DateInput value="" onChange={() => {}} required />)
    const input = document.querySelector('input[type="date"]')
    expect(input.required).toBe(true)
  })

  // H. disabled tetap disabled
  it('H. disabled input does not call showPicker', () => {
    render(<DateInput value="" onChange={() => {}} disabled />)
    const input = document.querySelector('input[type="date"]')
    const mockShowPicker = vi.fn()
    input.showPicker = mockShowPicker
    fireEvent.click(input)
    expect(mockShowPicker).not.toHaveBeenCalled()
  })

  // Extra: className tetap diteruskan
  it('passes className prop correctly', () => {
    render(<DateInput value="" onChange={() => {}} className="my-custom-class" />)
    const input = document.querySelector('input[type="date"]')
    expect(input.className).toContain('my-custom-class')
    expect(input.className).toContain('cursor-pointer')
  })

  // Extra: name dan id diteruskan
  it('passes name and id props', () => {
    render(<DateInput value="" onChange={() => {}} name="start_at" id="start_at" />)
    const input = document.querySelector('input[type="date"]')
    expect(input.name).toBe('start_at')
    expect(input.id).toBe('start_at')
  })
})
