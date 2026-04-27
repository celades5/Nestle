import { Kafka } from "kafkajs";

const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "product-review-api";
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || "ndg.poc.order";
const KAFKA_USERNAME = process.env.KAFKA_USERNAME;
const KAFKA_PASSWORD = process.env.KAFKA_PASSWORD;
const KAFKA_SSL = process.env.KAFKA_SSL === "true";

function createKafka() {
  /** @type {import("kafkajs").KafkaConfig} */
  const config = {
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS,
  };
  if (KAFKA_SSL) {
    config.ssl = true;
  }
  if (KAFKA_USERNAME && KAFKA_PASSWORD) {
    config.sasl = {
      mechanism: "plain",
      username: KAFKA_USERNAME,
      password: KAFKA_PASSWORD,
    };
  }
  return new Kafka(config);
}

/**
 * @param {{ id: string, name: string, price: number | null, value: number | null, inStock: boolean | null }} product
 * @param {string} reviewedAt ISO 8601
 */
export function buildProductReviewedEvent(product, reviewedAt) {
  return {
    type: "product.reviewed",
    source: "product-review-api",
    reviewed_at: reviewedAt,
    payload: {
      id: String(product.id),
      name: String(product.name ?? ""),
      price: product.price,
      value: product.value,
      inStock: product.inStock,
    },
  };
}

/**
 * @param {{ id: string, name: string, price: number | null, value: number | null, inStock: boolean | null }} product
 * @param {string} [reviewedAt] ISO 8601 (defaults to now)
 */
export async function publishProductReview(product, reviewedAt = new Date().toISOString()) {
  const kafka = createKafka();
  const producer = kafka.producer({
    allowAutoTopicCreation: true,
  });
  const event = buildProductReviewedEvent(product, reviewedAt);

  await producer.connect();
  try {
    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [
        { key: String(product.id), value: JSON.stringify(event) },
      ],
    });
    return event;
  } finally {
    await producer.disconnect();
  }
}

export { KAFKA_TOPIC };
