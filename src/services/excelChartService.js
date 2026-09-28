import JSZip from 'jszip'

/**
 * Service untuk menyisipkan Native Excel Chart Object (OpenXML DrawingML Chart)
 * ke dalam file .xlsx yang digenerate oleh ExcelJS.
 *
 * Sesuai spesifikasi chart.md & excell.md:
 * - Menghasilkan NATIVE Excel Bar/Column Chart Object (<c:chartSpace>)
 * - Terhubung langsung secara dinamis ke cell range data harian
 * - X-axis = Tanggal/Hari
 * - Y-axis = Revenue
 * - Judul = "Revenue Harian"
 * - Sepenuhnya editable saat file dibuka di Microsoft Excel
 * - Bukan conditional formatting DataBar
 */

function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Membangun XML OpenXML DrawingML Bar/Column Chart
 */
export function buildBarChartXml({
  title = 'Untung vs Rugi',
  seriesName = 'Nilai',
  headerRef = "'Ringkasan'!$AB$11",
  categoriesRef = "'Ringkasan'!$AA$12:$AA$13",
  valuesRef = "'Ringkasan'!$AB$12:$AB$13",
  categories = ['Untung', 'Rugi'],
  values = [0, 0],
}) {
  const catPointsXml = categories
    .map((cat, idx) => `<c:pt idx="${idx}"><c:v>${escapeXml(cat)}</c:v></c:pt>`)
    .join('')

  const valPointsXml = values
    .map((val, idx) => `<c:pt idx="${idx}"><c:v>${Number(val) || 0}</c:v></c:pt>`)
    .join('')

  const hasUntungRugi = categories.includes('Untung') || categories.includes('Rugi')
  const dPtsXml = hasUntungRugi
    ? categories
        .map((cat, idx) => {
          const isRugi = String(cat).toLowerCase().includes('rugi')
          const fill = isRugi ? 'EF4444' : '10B981'
          const border = isRugi ? 'DC2626' : '059669'
          return `<c:dPt><c:idx val="${idx}"/><c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="${border}"/></a:solidFill></a:ln></c:spPr></c:dPt>`
        })
        .join('')
    : ''

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="id-ID"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="1200" b="1"/>
            </a:pPr>
            <a:r>
              <a:rPr lang="id-ID"/>
              <a:t>${escapeXml(title)}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:layout/>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="${hasUntungRugi ? '1' : '0'}"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx>
            <c:strRef>
              <c:f>${escapeXml(headerRef)}</c:f>
              <c:strCache>
                <c:ptCount val="1"/>
                <c:pt idx="0">
                  <c:v>${escapeXml(seriesName)}</c:v>
                </c:pt>
              </c:strCache>
            </c:strRef>
          </c:tx>
          <c:spPr>
            <a:solidFill>
              <a:srgbClr val="10B981"/>
            </a:solidFill>
            <a:ln w="12700">
              <a:solidFill>
                <a:srgbClr val="059669"/>
              </a:solidFill>
            </a:ln>
          </c:spPr>
          ${dPtsXml}
          <c:cat>
            <c:strRef>
              <c:f>${escapeXml(categoriesRef)}</c:f>
              <c:strCache>
                <c:ptCount val="${categories.length}"/>
                ${catPointsXml}
              </c:strCache>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:f>${escapeXml(valuesRef)}</c:f>
              <c:numCache>
                <c:formatCode>&quot;Rp &quot;#,##0</c:formatCode>
                <c:ptCount val="${values.length}"/>
                ${valPointsXml}
              </c:numCache>
            </c:numRef>
          </c:val>
          <c:dLbls>
            <c:showLegendKey val="0"/>
            <c:showVal val="1"/>
            <c:showCatName val="0"/>
            <c:showSerName val="0"/>
            <c:showPercent val="0"/>
            <c:showLeaderLines val="0"/>
          </c:dLbls>
        </c:ser>
        <c:gapWidth val="150"/>
        <c:axId val="148921600"/>
        <c:axId val="148923136"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="148921600"/>
        <c:scaling>
          <c:orientation val="minMax"/>
        </c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="148923136"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="148923136"/>
        <c:scaling>
          <c:orientation val="minMax"/>
        </c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines>
          <c:spPr>
            <a:ln w="9525">
              <a:solidFill>
                <a:srgbClr val="E2E8F0"/>
              </a:solidFill>
            </a:ln>
          </c:spPr>
        </c:majorGridlines>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="148921600"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:layout/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr>
    <a:solidFill>
      <a:srgbClr val="FFFFFF"/>
    </a:solidFill>
    <a:ln w="12700">
      <a:solidFill>
        <a:srgbClr val="CBD5E1"/>
      </a:solidFill>
    </a:ln>
  </c:spPr>
</c:chartSpace>`
}

/**
 * Membangun XML OpenXML DrawingML Doughnut Chart untuk Komposisi Penjualan Produk (g1.md & qr.md)
 */
export function buildDoughnutChartXml({
  title = 'Komposisi Penjualan Produk',
  seriesName = 'Produk Terjual',
  headerRef = "'Ringkasan'!$AB$11",
  categoriesRef = "'Ringkasan'!$AA$12:$AA$13",
  valuesRef = "'Ringkasan'!$AB$12:$AB$13",
  categories = ['Belum ada penjualan'],
  values = [0],
  holeSize = 50,
  numFormat = '#,##0',
}) {
  const catPointsXml = categories
    .map((cat, idx) => `<c:pt idx="${idx}"><c:v>${escapeXml(cat)}</c:v></c:pt>`)
    .join('')

  const valPointsXml = values
    .map((val, idx) => `<c:pt idx="${idx}"><c:v>${Number(val) || 0}</c:v></c:pt>`)
    .join('')

  const CHART_PALETTE = [
    '10B981', // Emerald
    '3B82F6', // Blue
    'F59E0B', // Amber
    '8B5CF6', // Purple
    'EC4899', // Pink
    '06B6D4', // Cyan
    'F97316', // Orange
    '6366F1', // Indigo
    '14B8A6', // Teal
    '84CC16', // Lime
    '64748B', // Slate
  ]

  const dPtsXml = categories
    .map((cat, idx) => {
      const catLower = String(cat).toLowerCase()
      let color
      if (catLower.includes('rugi')) {
        color = 'EF4444'
      } else if (catLower.includes('untung')) {
        color = '10B981'
      } else {
        color = CHART_PALETTE[idx % CHART_PALETTE.length]
      }
      return `<c:dPt><c:idx val="${idx}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="id-ID"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="1200" b="1"/>
            </a:pPr>
            <a:r>
              <a:rPr lang="id-ID"/>
              <a:t>${escapeXml(title)}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:layout/>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:doughnutChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx>
            <c:strRef>
              <c:f>${escapeXml(headerRef)}</c:f>
              <c:strCache>
                <c:ptCount val="1"/>
                <c:pt idx="0">
                  <c:v>${escapeXml(seriesName)}</c:v>
                </c:pt>
              </c:strCache>
            </c:strRef>
          </c:tx>
          ${dPtsXml}
          <c:cat>
            <c:strRef>
              <c:f>${escapeXml(categoriesRef)}</c:f>
              <c:strCache>
                <c:ptCount val="${categories.length}"/>
                ${catPointsXml}
              </c:strCache>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:f>${escapeXml(valuesRef)}</c:f>
              <c:numCache>
                <c:formatCode>${escapeXml(numFormat)}</c:formatCode>
                <c:ptCount val="${values.length}"/>
                ${valPointsXml}
              </c:numCache>
            </c:numRef>
          </c:val>
        </c:ser>
        <c:dLbls>
          <c:showLegendKey val="0"/>
          <c:showVal val="0"/>
          <c:showCatName val="0"/>
          <c:showSerName val="0"/>
          <c:showPercent val="1"/>
          <c:separator val=" "/>
          <c:showLeaderLines val="1"/>
        </c:dLbls>
        <c:firstSliceAng val="0"/>
        <c:holeSize val="${holeSize}"/>
      </c:doughnutChart>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:layout/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr>
    <a:solidFill>
      <a:srgbClr val="FFFFFF"/>
    </a:solidFill>
    <a:ln w="12700">
      <a:solidFill>
        <a:srgbClr val="CBD5E1"/>
      </a:solidFill>
    </a:ln>
  </c:spPr>
</c:chartSpace>`
}

/**
 * Membangun XML OpenXML DrawingML Pie Chart untuk Komposisi Penjualan Produk (g1.md)
 */
export function buildPieChartXml({
  title = 'Komposisi Penjualan Produk',
  seriesName = 'Produk Terjual',
  headerRef = "'Ringkasan'!$AB$11",
  categoriesRef = "'Ringkasan'!$AA$12:$AA$13",
  valuesRef = "'Ringkasan'!$AB$12:$AB$13",
  categories = ['Belum ada penjualan'],
  values = [0],
  numFormat = '#,##0',
}) {
  const catPointsXml = categories
    .map((cat, idx) => `<c:pt idx="${idx}"><c:v>${escapeXml(cat)}</c:v></c:pt>`)
    .join('')

  const valPointsXml = values
    .map((val, idx) => `<c:pt idx="${idx}"><c:v>${Number(val) || 0}</c:v></c:pt>`)
    .join('')

  const CHART_PALETTE = [
    '10B981', '3B82F6', 'F59E0B', '8B5CF6', 'EC4899',
    '06B6D4', 'F97316', '6366F1', '14B8A6', '84CC16', '64748B'
  ]

  const dPtsXml = categories
    .map((cat, idx) => {
      const catLower = String(cat).toLowerCase()
      let color
      if (catLower.includes('rugi')) {
        color = 'EF4444'
      } else if (catLower.includes('untung')) {
        color = '10B981'
      } else {
        color = CHART_PALETTE[idx % CHART_PALETTE.length]
      }
      return `<c:dPt><c:idx val="${idx}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="id-ID"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="1200" b="1"/>
            </a:pPr>
            <a:r>
              <a:rPr lang="id-ID"/>
              <a:t>${escapeXml(title)}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:layout/>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx>
            <c:strRef>
              <c:f>${escapeXml(headerRef)}</c:f>
              <c:strCache>
                <c:ptCount val="1"/>
                <c:pt idx="0">
                  <c:v>${escapeXml(seriesName)}</c:v>
                </c:pt>
              </c:strCache>
            </c:strRef>
          </c:tx>
          ${dPtsXml}
          <c:cat>
            <c:strRef>
              <c:f>${escapeXml(categoriesRef)}</c:f>
              <c:strCache>
                <c:ptCount val="${categories.length}"/>
                ${catPointsXml}
              </c:strCache>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:f>${escapeXml(valuesRef)}</c:f>
              <c:numCache>
                <c:formatCode>${escapeXml(numFormat)}</c:formatCode>
                <c:ptCount val="${values.length}"/>
                ${valPointsXml}
              </c:numCache>
            </c:numRef>
          </c:val>
        </c:ser>
        <c:dLbls>
          <c:showLegendKey val="0"/>
          <c:showVal val="0"/>
          <c:showCatName val="0"/>
          <c:showSerName val="0"/>
          <c:showPercent val="1"/>
          <c:separator val=" "/>
          <c:showLeaderLines val="1"/>
        </c:dLbls>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:layout/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr>
    <a:solidFill>
      <a:srgbClr val="FFFFFF"/>
    </a:solidFill>
    <a:ln w="12700">
      <a:solidFill>
        <a:srgbClr val="CBD5E1"/>
      </a:solidFill>
    </a:ln>
  </c:spPr>
</c:chartSpace>`
}

/**
 * Dispatcher untuk membuat XML Chart berdasarkan chartType ('doughnut' | 'pie' | 'bar')
 */
export function buildChartXml(config) {
  if (config?.chartType === 'doughnut') {
    return buildDoughnutChartXml(config)
  }
  if (config?.chartType === 'pie') {
    return buildPieChartXml(config)
  }
  return buildBarChartXml(config)
}

/**
 * Membangun XML Drawing untuk menampung objek grafik pada posisi sel tertentu
 */
export function buildDrawingXml({
  chartName = 'Untung vs Rugi Chart',
  from = { col: 9, row: 10 },
  to = { col: 15, row: 28 },
}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from>
      <xdr:col>${from.col}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${from.row}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${to.col}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${to.row}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="${escapeXml(chartName)}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdChart1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
}

/**
 * Menyisipkan native chart ke file .xlsx buffer
 *
 * @param {ArrayBuffer|Buffer|Uint8Array} xlsxBuffer
 * @param {object} chartConfig
 * @returns {Promise<Buffer|ArrayBuffer>}
 */
export async function injectNativeChart(xlsxBuffer, chartConfig) {
  if (!xlsxBuffer || !chartConfig) return xlsxBuffer

  const zip = await JSZip.loadAsync(xlsxBuffer)

  // 1. Tentukan worksheet target berdasarkan sheetName
  let targetSheetPath = 'xl/worksheets/sheet1.xml'
  let targetSheetRelsPath = 'xl/worksheets/_rels/sheet1.xml.rels'

  const wbXml = await zip.file('xl/workbook.xml')?.async('text')
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')

  if (wbXml && wbRelsXml && chartConfig.sheetName) {
    const escapedSheetName = chartConfig.sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sheetRegex = new RegExp(`<sheet[^>]*name="${escapedSheetName}"[^>]*r:id="([^"]+)"`, 'i')
    const sheetMatch = wbXml.match(sheetRegex)
    if (sheetMatch && sheetMatch[1]) {
      const rId = sheetMatch[1]
      const relRegex = new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"`, 'i')
      const relMatch = wbRelsXml.match(relRegex)
      if (relMatch && relMatch[1]) {
        let cleanTarget = relMatch[1].replace(/^\/?xl\//, '').replace(/^\//, '')
        targetSheetPath = `xl/${cleanTarget}`
        const sheetFilename = cleanTarget.split('/').pop()
        targetSheetRelsPath = `xl/worksheets/_rels/${sheetFilename}.rels`
      }
    }
  }

  // 2. Daftarkan Content Types untuk drawing & chart
  let ctXml = await zip.file('[Content_Types].xml')?.async('text')
  if (ctXml) {
    let modifiedCt = ctXml
    if (!modifiedCt.includes('/xl/drawings/drawing1.xml')) {
      modifiedCt = modifiedCt.replace(
        '</Types>',
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>'
      )
      zip.file('[Content_Types].xml', modifiedCt)
    }
  }

  // 3. Konfigurasi worksheet relationship ke drawing1.xml
  const drawingRelId = 'rIdDrawing1'
  let sheetRelsXml = await zip.file(targetSheetRelsPath)?.async('text')
  if (sheetRelsXml) {
    if (!sheetRelsXml.includes('drawings/drawing1.xml')) {
      sheetRelsXml = sheetRelsXml.replace(
        '</Relationships>',
        `<Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`
      )
      zip.file(targetSheetRelsPath, sheetRelsXml)
    }
  } else {
    sheetRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
    zip.file(targetSheetRelsPath, sheetRelsXml)
  }

  // 4. Sisipkan tag <drawing> pada worksheet target
  let sheetXml = await zip.file(targetSheetPath)?.async('text')
  if (sheetXml && !sheetXml.includes('<drawing')) {
    const drawingTag = `<drawing r:id="${drawingRelId}"/>`
    if (sheetXml.includes('<legacyDrawing')) {
      sheetXml = sheetXml.replace('<legacyDrawing', `${drawingTag}<legacyDrawing`)
    } else if (sheetXml.includes('<picture')) {
      sheetXml = sheetXml.replace('<picture', `${drawingTag}<picture`)
    } else if (sheetXml.includes('<tableParts')) {
      sheetXml = sheetXml.replace('<tableParts', `${drawingTag}<tableParts`)
    } else if (sheetXml.includes('<extLst')) {
      sheetXml = sheetXml.replace('<extLst', `${drawingTag}<extLst`)
    } else {
      sheetXml = sheetXml.replace('</worksheet>', `${drawingTag}</worksheet>`)
    }
    zip.file(targetSheetPath, sheetXml)
  }

  // 5. Buat file drawing1.xml
  const drawingXml = buildDrawingXml({
    chartName: `${chartConfig.title || 'Revenue Harian'} Chart`,
    from: chartConfig.from || { col: 7, row: 10 },
    to: chartConfig.to || { col: 17, row: 28 },
  })
  zip.file('xl/drawings/drawing1.xml', drawingXml)

  // 6. Buat file drawing1.xml.rels
  const drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>`
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml)

  // 7. Buat file chart1.xml
  const chartXml = buildChartXml(chartConfig)
  zip.file('xl/charts/chart1.xml', chartXml)

  // 8. Generate output buffer
  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arrayBuffer)
  }
  return arrayBuffer
}
