import { Disk } from 'flydrive'
import { FSDriver } from 'flydrive/drivers/fs'
import { promises as fs } from 'fs'
import os from 'os'
import { DiskWrapper } from '../lib/disk'

let testDisk: DiskWrapper | undefined = undefined

export const TEST_DISK_LOCATION = `${os.tmpdir()}/test-disk-${process.pid}-${Date.now()}`

export default function getTestDisk() {
  if (!testDisk) {
    const disk = new Disk(
      new FSDriver({
        location: TEST_DISK_LOCATION,
        visibility: 'public',
      }),
    )

    const testDisk = new DiskWrapper('private', disk)
    return testDisk
  }

  return testDisk
}

export async function removeTestFolder() {
  try {
    await fs.rm(TEST_DISK_LOCATION, { recursive: true, force: true })
  } catch (error) {
    console.error('Failed to remove test disk:', error)
  }
}
