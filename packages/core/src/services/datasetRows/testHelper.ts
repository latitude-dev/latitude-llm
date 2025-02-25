import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const TEST_CSV_CONTENT = `name,surname,age,nationality
Paco,Merlo,43,Spanish
Frank,Merlo,11,North American
François,Merlo,84,French
Francesco,Merlo,19,Italian
Francisco,Merlo,9,Portuguese
Frančišek,Merlo,89,Slovenian
Francis, Merlo,23,British
Franz, Merlo,48,German
Fan Invalid, 69, InventedCountry` // It will not be included in the dataset because is not parsed correctly

export async function createTestCsvFile({
  name = 'test.csv',
  fileContent = TEST_CSV_CONTENT,
}: {
  name?: string
  fileContent?: string
} = {}) {
  const tempDir = os.tmpdir()
  const filePath = path.join(tempDir, name)

  try {
    await fs.access(filePath) // Check if file exists
  } catch {
    await fs.writeFile(filePath, fileContent)
  }

  const bytes = await fs.readFile(filePath)
  const file = new File([bytes], name, { type: 'text/csv' })

  return { file }
}
