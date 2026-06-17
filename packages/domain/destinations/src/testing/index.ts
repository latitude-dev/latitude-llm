export { createFakeDestinationDeliverer, type RecordedDelivery } from "./fake-destination-deliverer.ts"
export { createFakeDestinationMapper } from "./fake-destination-mapper.ts"
export { createFakeDestinationRepository } from "./fake-destination-repository.ts"
export {
  createFakeDestinationSourceReader,
  type FakeSourceWindowInput,
  fakeSourceReaderRegistry,
  SPANS_SOURCE,
  staticSourceReader,
} from "./fake-destination-source-reader.ts"
export { createFakeDestinationSourceStateRepository } from "./fake-destination-source-state-repository.ts"
export { createFakeDestinationSyncRunRepository } from "./fake-destination-sync-run-repository.ts"
