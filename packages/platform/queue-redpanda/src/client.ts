import { Kafka, logLevel } from "kafkajs"
import type { KafkaConfig } from "./types.ts"

export const createKafkaClient = (config: KafkaConfig): Kafka => {
  const kafkaConfig: import("kafkajs").KafkaConfig = {
    clientId: config.clientId,
    brokers: config.brokers,
    logLevel: logLevel.INFO,
    retry: {
      initialRetryTime: 100,
      retries: 8,
      maxRetryTime: 30000,
    },
  }

  if (config.ssl !== undefined) {
    kafkaConfig.ssl = config.ssl
  }

  if (config.sasl !== undefined) {
    kafkaConfig.sasl = config.sasl
  }

  return new Kafka(kafkaConfig)
}
