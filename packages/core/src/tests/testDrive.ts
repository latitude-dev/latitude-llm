import { Disk } from 'flydrive'
import { DiskWrapper } from '../lib'
import { FSDriver } from 'flydrive/drivers/fs'

let testDisk: DiskWrapper

export default function getTestDisk() {
  if (!testDisk) {
    const disk = new Disk(
      new FSDriver({
        location: '/tmp',
        visibility: 'private',
      }),
    )

    const testDisk = new DiskWrapper('private', disk)
    return testDisk
  }

  return testDisk
}
