import { Readable } from 'stream'
import { DiskWrapper } from '../../lib'

const CSV_CONTENT = `name,surname,age,nationality
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
  disk,
  name = 'test.csv',
  fileContent = CSV_CONTENT,
}: {
  disk: DiskWrapper
  name?: string
  fileContent?: string
}) {
  const existingFile = disk.file(name)

  if (!(await existingFile.exists())) {
    const stream = Readable.from(fileContent)
    await disk.putStream(name, stream)
  }

  const drive = disk.file(name)
  const bytes = await drive.getBytes()
  const file = new File([bytes], 'test.csv', { type: 'text/csv' })

  return { file }
}
