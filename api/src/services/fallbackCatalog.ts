/**
 * Catálogo de amostra, embutido no código. É usado SOMENTE quando a API pública (Tabela FIPE)
 * está fora do ar e não há nada em cache, para que o leiloeiro nunca fique travado.
 * Os preços são ilustrativos (aproximações), não valores oficiais da FIPE.
 */
export interface FallbackVehicle {
  brand: string
  model: string
  year: number
  fuel: string
  priceReais: number
}

export const FALLBACK_VEHICLES: FallbackVehicle[] = [
  { brand: 'Fiat', model: 'Argo Drive 1.0 Flex', year: 2022, fuel: 'Gasolina', priceReais: 69500 },
  { brand: 'Fiat', model: 'Toro Freedom 1.8 Flex', year: 2021, fuel: 'Gasolina', priceReais: 112000 },
  { brand: 'Fiat', model: 'Mobi Like 1.0 Flex', year: 2023, fuel: 'Gasolina', priceReais: 63900 },
  { brand: 'Volkswagen', model: 'Gol 1.0 Total Flex', year: 2020, fuel: 'Gasolina', priceReais: 49800 },
  { brand: 'Volkswagen', model: 'T-Cross Highline 1.4 TSI', year: 2022, fuel: 'Gasolina', priceReais: 134500 },
  { brand: 'Volkswagen', model: 'Polo Track 1.0 Flex', year: 2023, fuel: 'Gasolina', priceReais: 76900 },
  { brand: 'Chevrolet', model: 'Onix Plus Premier 1.0 Turbo', year: 2022, fuel: 'Gasolina', priceReais: 93500 },
  { brand: 'Chevrolet', model: 'Tracker Premier 1.2 Turbo', year: 2023, fuel: 'Gasolina', priceReais: 143900 },
  { brand: 'Chevrolet', model: 'S10 LTZ 2.8 Diesel 4x4', year: 2021, fuel: 'Diesel', priceReais: 207000 },
  { brand: 'Toyota', model: 'Corolla XEi 2.0 Flex', year: 2022, fuel: 'Gasolina', priceReais: 149800 },
  { brand: 'Toyota', model: 'Hilux SRX 2.8 Diesel 4x4', year: 2022, fuel: 'Diesel', priceReais: 289000 },
  { brand: 'Toyota', model: 'Yaris XL Sedan 1.5 Flex', year: 2021, fuel: 'Gasolina', priceReais: 89900 },
  { brand: 'Honda', model: 'Civic Touring 1.5 Turbo', year: 2021, fuel: 'Gasolina', priceReais: 165000 },
  { brand: 'Honda', model: 'HR-V EXL 1.8 Flex', year: 2022, fuel: 'Gasolina', priceReais: 142000 },
  { brand: 'Honda', model: 'Fit EX 1.5 Flex', year: 2019, fuel: 'Gasolina', priceReais: 78500 },
  { brand: 'Hyundai', model: 'HB20 Comfort Plus 1.0 Flex', year: 2022, fuel: 'Gasolina', priceReais: 72900 },
  { brand: 'Hyundai', model: 'Creta Ultimate 2.0 Flex', year: 2023, fuel: 'Gasolina', priceReais: 152900 },
  { brand: 'Jeep', model: 'Compass Limited 1.3 T270', year: 2023, fuel: 'Gasolina', priceReais: 178000 },
  { brand: 'Jeep', model: 'Renegade Longitude 1.8 Flex', year: 2020, fuel: 'Gasolina', priceReais: 94500 },
  { brand: 'Renault', model: 'Kwid Zen 1.0 Flex', year: 2022, fuel: 'Gasolina', priceReais: 47900 },
  { brand: 'Renault', model: 'Duster Iconic 1.3 Turbo', year: 2023, fuel: 'Gasolina', priceReais: 118900 },
  { brand: 'Ford', model: 'Ranger XLT 3.2 Diesel 4x4', year: 2019, fuel: 'Diesel', priceReais: 189000 },
  { brand: 'BMW', model: '320i Sport 2.0 Turbo', year: 2021, fuel: 'Gasolina', priceReais: 225000 },
  { brand: 'Mercedes-Benz', model: 'C 180 Avantgarde 1.6 Turbo', year: 2020, fuel: 'Gasolina', priceReais: 198000 },
]

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const FALLBACK_PREFIX = 'fb:'
export const isFallbackCode = (code: string) => code.startsWith(FALLBACK_PREFIX)

export const fbBrandCode = (brand: string) => `${FALLBACK_PREFIX}${slug(brand)}`
export const fbModelCode = (v: FallbackVehicle) => `${FALLBACK_PREFIX}${slug(v.brand)}:${slug(v.model)}`
export const fbYearCode = (v: FallbackVehicle) => String(v.year)

export function fallbackBrands() {
  const names = [...new Set(FALLBACK_VEHICLES.map((v) => v.brand))].sort()
  return names.map((name) => ({ code: fbBrandCode(name), name }))
}

export function fallbackModels(brandCode: string) {
  return FALLBACK_VEHICLES.filter((v) => fbBrandCode(v.brand) === brandCode).map((v) => ({
    code: fbModelCode(v),
    name: v.model,
  }))
}

export function fallbackYears(brandCode: string, modelCode: string) {
  return FALLBACK_VEHICLES.filter((v) => fbBrandCode(v.brand) === brandCode && fbModelCode(v) === modelCode).map(
    (v) => ({ code: fbYearCode(v), name: `${v.year} ${v.fuel}` }),
  )
}

export function fallbackVehicle(brandCode: string, modelCode: string, yearCode: string) {
  const idx = FALLBACK_VEHICLES.findIndex(
    (v) => fbBrandCode(v.brand) === brandCode && fbModelCode(v) === modelCode && fbYearCode(v) === yearCode,
  )
  if (idx < 0) return null
  const v = FALLBACK_VEHICLES[idx]!
  return {
    brand: v.brand,
    model: v.model,
    modelYear: v.year,
    fuel: v.fuel,
    priceCents: v.priceReais * 100,
    codeFipe: `AMOSTRA-${String(idx + 1).padStart(3, '0')}`,
    referenceMonth: 'catálogo de amostra (offline)',
  }
}
